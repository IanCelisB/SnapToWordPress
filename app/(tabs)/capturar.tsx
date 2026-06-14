// app/(tabs)/capturar.tsx — the capture flow (WU-3, product-capture
// spec R1-R6).
//
// Multi-step flow: camera (or library picker) → form → save.
//   1. The top of the screen shows the captured image strip (tap to
//      remove; "Agregar foto" / "Elegir de la galería" buttons add
//      more).
//   2. The form has name, integer price, category, description.
//   3. "Guardar producto" calls `validate()` on the store; on success
//      builds the product and writes it through `productsRepo` +
//      `imagesRepo`. On validation failure, renders the error card.
//   4. On a successful save, navigates back to the list.
//
// Uses the new design tokens + primitive components.

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
import { productsRepo, imagesRepo, categoriesRepo } from '@/db/repos';
import { openDB } from '@/db';
import { Strings } from '@/ui/strings';
import {
  Button,
  ErrorCard,
  Header,
  Input,
} from '@/ui/primitives';
import {
  colors,
  radius,
  spacing,
  typography,
} from '@/ui/theme';
import { persistCapturedImage } from '@/services/image-persistence';
import { useCameraPermissionState } from '@/services/camera-permission';
import { SyncBanner } from '@/ui/components/SyncBanner';
import type { StoreCategory } from '@/domain/types';
import { presentError, type CatalogEntry } from '@/error-presentation';

// One store instance per process — capture-form state is module-scoped
// (it's a draft, no need for multiple Zustand instances).
const useCaptureStore = createCaptureFormStore();

export default function Capture(): React.ReactElement {
  const router = useRouter();
  const form = useCaptureStore();
  const [error, setError] = useState<CatalogEntry | null>(null);
  const [categories, setCategories] = useState<ReadonlyArray<StoreCategory>>([]);
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

  // Camera permission must be read BEFORE the useCallbacks that
  // reference `permission` / `request`, otherwise those references
  // hit the temporal dead zone and React's useCallback factory
  // throws on render. (This is a JS hoisting issue, not a React
  // rules-of-hooks violation — the hook itself is called once per
  // render and only in this position.)
  const { permission, request } = useCameraPermissionState();

  const handleAddFromCamera = useCallback(async () => {
    setError(null);
    if (!permission.status || permission.status === 'denied') {
      const result = await request();
      if (!result.granted) {
        setError(presentError(result.classification));
        return;
      }
    }
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
  }, [permission, request, form]);

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
      router.replace('/(tabs)/lista');
    } catch (err) {
      setError(presentError(err));
    } finally {
      form.setSaving(false);
    }
  }, [form, router]);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Header
            title={Strings.captureTitle}
            subtitle={Strings.captureHint}
          />

          <SyncBanner />

          {/* Image strip */}
          <View style={styles.section}>
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
              <Button
                label={Strings.captureTakePhoto}
                onPress={handleAddFromCamera}
                variant="primary"
                fullWidth
                testID="capture.add.camera"
              />
              <Button
                label={Strings.captureFromLibrary}
                onPress={handleAddFromLibrary}
                variant="secondary"
                fullWidth
                testID="capture.add.library"
              />
            </View>
            {form.imageUris.length >= 5 ? (
              <Text style={styles.limitHint}>{Strings.capturePhotoLimit}</Text>
            ) : null}
          </View>

          {/* Form */}
          <View style={styles.section}>
            <Input
              label={Strings.captureFieldName}
              value={form.name}
              onChangeText={form.setName}
              placeholder={Strings.captureFieldNamePlaceholder}
              testID="capture.field.name"
              multiline
            />
            <Input
              label={Strings.captureFieldPrice}
              value={form.price}
              onChangeText={form.setPrice}
              placeholder={Strings.captureFieldPricePlaceholder}
              testID="capture.field.price"
              keyboardType="number-pad"
            />

            <Text style={styles.inputLabel}>{Strings.captureFieldCategory}</Text>
            {categoriesLoading ? (
              <Text style={styles.muted}>
                {Strings.captureFieldCategoryLoading}
              </Text>
            ) : (
              <View style={styles.categoryPicker}>
                <Pressable
                  onPress={() => form.setCategory(null, null)}
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

            <Input
              label={Strings.captureFieldDescription}
              value={form.description}
              onChangeText={form.setDescription}
              placeholder={Strings.captureFieldDescriptionPlaceholder}
              testID="capture.field.description"
              multiline
            />
          </View>

          {error ? (
            <ErrorCard
              title={error.title}
              message={error.message}
              testID="capture.error"
            />
          ) : null}

          <Button
            label={Strings.captureSave}
            onPress={handleSave}
            disabled={form.saving}
            loading={form.saving}
            variant="primary"
            size="lg"
            fullWidth
            testID="capture.save"
            style={styles.saveButton}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  section: {
    marginBottom: spacing.xl,
  },
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
  thumbRemoveText: { color: colors.textInverse, fontSize: 16, fontWeight: 'bold' },
  placeholder: {
    width: '100%',
    height: 96,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  placeholderText: { color: colors.textMuted, textAlign: 'center', ...typography.caption },
  row: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  limitHint: { color: colors.warning, ...typography.caption, marginTop: spacing.xs },
  inputLabel: {
    ...typography.captionEmphasis,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  muted: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.md },
  categoryPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontSize: 14 },
  chipTextActive: { color: colors.textInverse, fontWeight: '600' },
  saveButton: {
    marginTop: spacing.lg,
  },
});

// Re-export the TextInput from primitives to keep the import surface
// consistent with the rest of the components.
export { TextInput };
