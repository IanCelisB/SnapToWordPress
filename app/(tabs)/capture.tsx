// app/(tabs)/capture.tsx — the capture flow (WU-3, product-capture
// spec R1-R6).
//
// Multi-step flow: camera (or library picker) → form → save.
//   1. The top of the screen shows the captured image strip (tap to
//      remove; "Agregar foto" / "Elegir de la galería" buttons add
//      more).
//   2. The form has name, integer price, category, description.
//   3. "Guardar producto" calls `validate()` on the store; on success
//      builds the product and writes it through `productsRepo` +
//      `imagesRepo`. On validation failure, renders the catalog card.
//   4. On a successful save, navigates back to the queue.
//
// All Spanish text comes from `src/ui/strings.ts` and the
// error-presentation catalog. Components NEVER inline Spanish.
//
// The screen is a `<Stack.Screen>` because the (tabs) layout uses a
// stack for now (the bottom tabs are deferred to WU-5 polish).

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  launchCameraAsync,
  launchImageLibraryAsync,
  MediaTypeOptions,
} from 'expo-image-picker';

import { createCaptureFormStore } from '@/stores/captureFormStore';
import { useReviewQueueStore } from '@/stores/reviewQueueStore';
import { presentError, type CatalogEntry } from '@/error-presentation';
import { productsRepo, imagesRepo, categoriesRepo } from '@/db/repos';
import { openDB } from '@/db';
import { Strings } from '@/ui/strings';
import { colors, radius, spacing } from '@/ui/theme';
import {
  persistCapturedImage,
} from '@/services/image-persistence';
import { useCameraPermissionState } from '@/services/camera-permission';
import { SyncBanner } from '@/ui/components/SyncBanner';
import type { StoreCategory } from '@/domain/types';

// One store instance per process — capture-form state is module-scoped
// (it's a draft, no need for multiple Zustand instances).
const useCaptureStore = createCaptureFormStore();

export default function Capture(): React.ReactElement {
  const router = useRouter();
  const form = useCaptureStore();
  const [reviewQueue, setReviewQueue] = useState<Awaited<
    ReturnType<typeof useReviewQueueStore>
  > | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const store = await useReviewQueueStore();
      if (!cancelled) {
        setReviewQueue(store);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const { permission, request } = useCameraPermissionState();
  const [error, setError] = useState<CatalogEntry | null>(null);
  const [categories, setCategories] = useState<ReadonlyArray<StoreCategory>>(
    [],
  );
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  // Load the cached categories on mount (offline-safe; stale-while-
  // revalidate runs in WU-4 per Design §2 Q3).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setCategoriesLoading(true);
        const db = await openDB();
        const list = await categoriesRepo.list(db);
        if (!cancelled) {
          setCategories(list);
        }
      } catch {
        // Silent — categories are an optional field. The user can
        // still save with no category (the validation enforces this).
      } finally {
        if (!cancelled) {
          setCategoriesLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAddFromCamera = useCallback(async () => {
    setError(null);
    if (!permission.status || permission.status === 'denied') {
      const result = await request();
      if (!result.granted) {
        setError(presentError(result.classification));
        return;
      }
    }
    // Camera output capture is handled by `CameraView` + an
    // onPressable snapshot; for the MVP we route to the picker flow
    // until the camera UI is wired (next iteration of the screen).
    // The product-capture spec R1 is satisfied either way — the
    // spec requires that "the image is stored on-device and a row is
    // inserted into product_images". The picker path covers that.
    const picker = await launchCameraAsync({
      mediaTypes: MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (picker.canceled || !picker.assets?.[0]) {
      return;
    }
    const asset = picker.assets[0];
    if (!asset || !asset.uri) {
      return;
    }
    const persisted = await persistCapturedImage(asset.uri);
    form.addImage(persisted.filePath, persisted.filePath);
  }, [permission.status, request, form]);

  const handleAddFromLibrary = useCallback(async () => {
    setError(null);
    const result = await launchImageLibraryAsync({
      mediaTypes: MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) {
      return;
    }
    const asset = result.assets[0];
    if (!asset || !asset.uri) {
      return;
    }
    const persisted = await persistCapturedImage(asset.uri);
    form.addImage(persisted.filePath, persisted.filePath);
  }, [form]);

  const handleSave = useCallback(async () => {
    setError(null);
    const validationError = form.validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    form.setSaving(true);
    try {
      const product = form.buildProduct();
      const db = await openDB();
      await db.transaction(async (tx) => {
        await productsRepo.insert(tx, product);
        for (const image of product.images) {
          await imagesRepo.insert(tx, {
            productLocalId: product.localId,
            filePath: image.filePath,
            position: image.position,
          });
        }
      });
      form.setLastSavedLocalId(product.localId);
      form.reset();
      if (reviewQueue) {
        await reviewQueue.getState().load();
      }
      router.replace('/(tabs)/queue');
    } catch (err) {
      setError(presentError(err));
    } finally {
      form.setSaving(false);
    }
  }, [form, reviewQueue, router]);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>{Strings.captureTitle}</Text>
          <Text style={styles.subtitle}>{Strings.captureHint}</Text>

          <SyncBanner />

          <View style={styles.imageStrip}>
            {form.imageUris.map((img) => (
              <View key={img.draftId} style={styles.thumbWrap}>
                <Image
                  source={{ uri: img.uri }}
                  style={styles.thumb}
                  testID={`capture.thumb.${img.draftId}`}
                />
                <Pressable
                  onPress={() => form.removeImage(img.draftId)}
                  style={styles.thumbRemove}
                  testID={`capture.thumb.remove.${img.draftId}`}
                >
                  <Text style={styles.thumbRemoveText}>×</Text>
                </Pressable>
              </View>
            ))}
            {form.imageUris.length === 0 ? (
              <View style={styles.placeholder}>
                <Text style={styles.placeholderText}>
                  {Strings.cameraPermissionPrompt}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.row}>
            <Pressable
              onPress={handleAddFromCamera}
              style={[styles.button, styles.buttonPrimary]}
              testID="capture.add.camera"
            >
              <Text style={styles.buttonPrimaryText}>
                {Strings.captureTakePhoto}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleAddFromLibrary}
              style={[styles.button, styles.buttonSecondary]}
              testID="capture.add.library"
            >
              <Text style={styles.buttonSecondaryText}>
                {Strings.captureFromLibrary}
              </Text>
            </Pressable>
          </View>
          {form.imageUris.length >= 5 ? (
            <Text style={styles.limitHint}>{Strings.capturePhotoLimit}</Text>
          ) : null}

          <Field
            label={Strings.captureFieldName}
            value={form.name}
            onChangeText={form.setName}
            placeholder={Strings.captureFieldNamePlaceholder}
            testID="capture.field.name"
            multiline
          />
          <Field
            label={Strings.captureFieldPrice}
            value={form.price}
            onChangeText={form.setPrice}
            placeholder={Strings.captureFieldPricePlaceholder}
            testID="capture.field.price"
            keyboardType="number-pad"
          />

          <Text style={styles.label}>{Strings.captureFieldCategory}</Text>
          {categoriesLoading ? (
            <Text style={styles.muted}>
              {Strings.captureFieldCategoryLoading}
            </Text>
          ) : (
            <View style={styles.categoryPicker}>
              <Pressable
                onPress={() => {
                  // The category list is presented as a horizontal
                  // chip strip; the first chip is the "no category"
                  // sentinel. A full picker is deferred to WU-5.
                  form.setCategory(null, null);
                }}
                style={[
                  styles.chip,
                  form.categoryId === null && styles.chipActive,
                ]}
                testID="capture.field.category.none"
              >
                <Text
                  style={[
                    styles.chipText,
                    form.categoryId === null && styles.chipTextActive,
                  ]}
                >
                  —
                </Text>
              </Pressable>
              {categories.map((c) => (
                <Pressable
                  key={c.wcCategoryId}
                  onPress={() => form.setCategory(c.wcCategoryId, c.name)}
                  style={[
                    styles.chip,
                    form.categoryId === c.wcCategoryId && styles.chipActive,
                  ]}
                  testID={`capture.field.category.${c.wcCategoryId}`}
                >
                  <Text
                    style={[
                      styles.chipText,
                      form.categoryId === c.wcCategoryId && styles.chipTextActive,
                    ]}
                  >
                    {c.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <Field
            label={Strings.captureFieldDescription}
            value={form.description}
            onChangeText={form.setDescription}
            placeholder={Strings.captureFieldDescriptionPlaceholder}
            testID="capture.field.description"
            multiline
          />

          {error ? (
            <View style={styles.errorCard} testID="capture.error">
              <Text style={styles.errorTitle}>{error.title}</Text>
              <Text style={styles.errorMessage}>{error.message}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={handleSave}
            disabled={form.saving}
            style={[styles.primary, form.saving && styles.primaryDisabled]}
            testID="capture.save"
          >
            {form.saving ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.primaryText}>{Strings.captureSave}</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  testID?: string;
  keyboardType?: 'default' | 'number-pad' | 'url' | 'email-address';
  multiline?: boolean;
};

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  testID,
  keyboardType = 'default',
  multiline = false,
}: FieldProps): React.ReactElement {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType}
        multiline={multiline}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  title: { fontSize: 26, fontWeight: 'bold', color: colors.text, marginBottom: spacing.sm },
  subtitle: { fontSize: 15, color: colors.muted, marginBottom: spacing.xl, lineHeight: 22 },
  imageStrip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  thumbWrap: { position: 'relative' },
  thumb: {
    width: 96,
    height: 96,
    borderRadius: radius.md,
    backgroundColor: colors.line,
  },
  thumbRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbRemoveText: { color: colors.surface, fontSize: 16, fontWeight: 'bold' },
  placeholder: {
    height: 96,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  placeholderText: { color: colors.muted, textAlign: 'center', fontSize: 14 },
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  button: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonPrimaryText: { color: colors.surface, fontWeight: 'bold' },
  buttonSecondary: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1 },
  buttonSecondaryText: { color: colors.text, fontWeight: 'bold' },
  limitHint: { color: colors.warning, fontSize: 13, marginBottom: spacing.md },
  field: { marginBottom: spacing.lg },
  label: { fontSize: 14, color: colors.muted, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  categoryPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 14 },
  chipTextActive: { color: colors.surface, fontWeight: 'bold' },
  muted: { color: colors.muted, fontSize: 14, marginBottom: spacing.md },
  errorCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorTitle: { fontSize: 16, fontWeight: 'bold', color: colors.error, marginBottom: spacing.xs },
  errorMessage: { fontSize: 14, color: colors.text, lineHeight: 20 },
  primary: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  primaryDisabled: { opacity: 0.6 },
  primaryText: { color: colors.surface, fontSize: 16, fontWeight: 'bold' },
});

