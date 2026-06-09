// app/(tabs)/queue/[id].tsx — per-product review/edit screen
// (WU-3, review-queue spec R1-R5).
//
// Allows editing any field (name, price, category, description).
// The price-gate is the anti-mistake feature (spec R4): the user
// MUST tap "Confirmar precio" before the product becomes syncable.
// "Aprobar" (or "Marcar como listo") is only enabled when
// `price_confirmed = true`.
//
// The "Eliminar de la cola" action is the only destructive flow and
// is gated by an explicit `Alert` dialog (spec R5).
//
// All Spanish strings come from `src/ui/strings.ts` and the
// error-presentation catalog.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  useReviewQueueStore,
  __resetReviewQueueStoreForTest,
} from '@/stores/reviewQueueStore';
import { presentError, type CatalogEntry } from '@/error-presentation';
import { openDB } from '@/db';
import {
  productsRepo,
  imagesRepo,
  categoriesRepo,
} from '@/db/repos';
import { removeImageFile } from '@/services/image-persistence';
import { Strings } from '@/ui/strings';
import { PriceConfirmGate } from '@/ui/components/PriceConfirmGate';
import { colors, radius, spacing } from '@/ui/theme';
import type {
  Product,
  ProductImage,
  StoreCategory,
} from '@/domain/types';

export default function EditProduct(): React.ReactElement {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const [store, setStore] = useState<Awaited<
    ReturnType<typeof useReviewQueueStore>
  > | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [images, setImages] = useState<ReadonlyArray<ProductImage>>([]);
  const [categories, setCategories] = useState<ReadonlyArray<StoreCategory>>(
    [],
  );
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [priceConfirmed, setPriceConfirmed] = useState(false);
  const [priceEdited, setPriceEdited] = useState(false);
  const [originalPrice, setOriginalPrice] = useState(0);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categoryName, setCategoryName] = useState<string | null>(null);
  const [publishOnSync, setPublishOnSync] = useState(false);
  const [error, setError] = useState<CatalogEntry | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await openDB();
        const cats = await categoriesRepo.list(db);
        const s = await useReviewQueueStore();
        if (cancelled) return;
        setStore(s);
        setCategories(cats);
        const p = await productsRepo.get(db, id);
        if (!p) {
          setError(presentError('error-inesperado'));
          return;
        }
        if (cancelled) return;
        setProduct(p);
        setName(p.name);
        setPrice(String(p.price));
        setDescription(p.description ?? '');
        setPriceConfirmed(p.priceConfirmed);
        setOriginalPrice(p.price);
        setCategoryId(p.categoryId);
        setCategoryName(p.categoryName);
        setPublishOnSync(p.publishOnSync);
        const imgs = await imagesRepo.listForProduct(db, id);
        if (!cancelled) {
          setImages(imgs);
        }
      } catch (err) {
        setError(presentError(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handlePriceChange = useCallback(
    (next: string) => {
      const cleaned = next.replace(/[^\d]/g, '');
      setPrice(cleaned);
      if (Number(cleaned) !== originalPrice) {
        setPriceEdited(true);
        setPriceConfirmed(false);
      } else {
        setPriceEdited(false);
      }
    },
    [originalPrice],
  );

  const handleNameBlur = useCallback(async () => {
    if (!store || !product) return;
    if (name.trim() === product.name) return;
    const err = await store.getState().updateField(product.localId, {
      name: name.trim(),
    });
    if (err) setError(err);
  }, [name, product, store]);

  const handleDescriptionBlur = useCallback(async () => {
    if (!store || !product) return;
    const trimmed = description.trim();
    if ((product.description ?? '') === trimmed) return;
    const err = await store.getState().updateField(product.localId, {
      description: trimmed.length > 0 ? trimmed : null,
    });
    if (err) setError(err);
  }, [description, product, store]);

  const handleCategorySelect = useCallback(
    async (nextId: number | null, nextName: string | null) => {
      setCategoryId(nextId);
      setCategoryName(nextName);
      if (!store || !product) return;
      const err = await store.getState().updateField(product.localId, {
        categoryId: nextId,
        categoryName: nextName,
      });
      if (err) setError(err);
    },
    [product, store],
  );

  const handleTogglePublish = useCallback(
    async (next: boolean) => {
      setPublishOnSync(next);
      if (!store || !product) return;
      const err = await store.getState().updateField(product.localId, {
        publishOnSync: next,
      });
      if (err) setError(err);
    },
    [product, store],
  );

  const handleConfirmPrice = useCallback(async () => {
    if (!store || !product) return;
    setBusy(true);
    try {
      // Persist the new price first.
      const newPrice = Number(price);
      if (newPrice !== product.price) {
        const err = await store.getState().updateField(product.localId, {
          price: newPrice,
        });
        if (err) {
          setError(err);
          return;
        }
      }
      const err = await store.getState().confirmPrice(product.localId);
      if (err) {
        setError(err);
        return;
      }
      setPriceConfirmed(true);
      setPriceEdited(false);
      setOriginalPrice(newPrice);
    } finally {
      setBusy(false);
    }
  }, [price, product, store]);

  const handleEditPrice = useCallback(() => {
    setPriceConfirmed(false);
    setPriceEdited(true);
  }, []);

  const handleApprove = useCallback(async () => {
    if (!store || !product) return;
    setBusy(true);
    try {
      const err = await store.getState().approve(product.localId);
      if (err) {
        setError(err);
        return;
      }
      router.back();
    } finally {
      setBusy(false);
    }
  }, [product, router, store]);

  const handleDelete = useCallback(() => {
    if (!store || !product) return;
    Alert.alert(
      Strings.editDeleteConfirmTitle,
      Strings.editDeleteConfirmMessage,
      [
        { text: Strings.editDeleteConfirmNo, style: 'cancel' },
        {
          text: Strings.editDeleteConfirmYes,
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const db = await openDB();
              await Promise.all(
                images
                  .map((i) => i.filePath)
                  .filter((p): p is string => p.length > 0)
                  .map((p) => removeImageFile(p)),
              );
              const err = await store.getState().delete(product.localId);
              if (err) {
                setError(err);
                return;
              }
              router.back();
            } catch (err) {
              setError(presentError(err));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }, [images, product, router, store]);

  if (!product) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          {error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorTitle}>{error.title}</Text>
              <Text style={styles.errorMessage}>{error.message}</Text>
            </View>
          ) : (
            <ActivityIndicator color={colors.muted} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const canApprove = priceConfirmed;

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{Strings.editTitle}</Text>

        <Field
          label={Strings.editFieldName}
          value={name}
          onChangeText={setName}
          onBlur={handleNameBlur}
          testID="edit.field.name"
        />
        <Field
          label={Strings.editFieldPrice}
          value={price}
          onChangeText={handlePriceChange}
          testID="edit.field.price"
          keyboardType="number-pad"
        />

        <PriceConfirmGate
          originalPrice={originalPrice}
          currentPrice={Number(price) || 0}
          priceConfirmed={priceConfirmed}
          priceEdited={priceEdited}
          onConfirm={handleConfirmPrice}
          onEdit={handleEditPrice}
        />

        <Text style={styles.label}>{Strings.editFieldCategory}</Text>
        <View style={styles.categoryPicker}>
          {categories.map((c) => (
            <Pressable
              key={c.wcCategoryId}
              onPress={() => handleCategorySelect(c.wcCategoryId, c.name)}
              style={[
                styles.chip,
                categoryId === c.wcCategoryId && styles.chipActive,
              ]}
              testID={`edit.field.category.${c.wcCategoryId}`}
            >
              <Text
                style={[
                  styles.chipText,
                  categoryId === c.wcCategoryId && styles.chipTextActive,
                ]}
              >
                {c.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <Field
          label={Strings.editFieldDescription}
          value={description}
          onChangeText={setDescription}
          onBlur={handleDescriptionBlur}
          testID="edit.field.description"
          multiline
        />

        <View style={styles.publishRow}>
          <View style={styles.publishBody}>
            <Text style={styles.publishTitle}>{Strings.editPublishTitle}</Text>
            <Text style={styles.publishHint}>
              {publishOnSync
                ? Strings.editPublishHint
                : Strings.editPublishDraft}
            </Text>
          </View>
          <Switch
            value={publishOnSync}
            onValueChange={handleTogglePublish}
            testID="edit.field.publish"
          />
        </View>

        {error ? (
          <View style={styles.errorCard} testID="edit.error">
            <Text style={styles.errorTitle}>{error.title}</Text>
            <Text style={styles.errorMessage}>{error.message}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={handleApprove}
          disabled={!canApprove || busy}
          style={[
            styles.primary,
            (!canApprove || busy) && styles.primaryDisabled,
          ]}
          testID="edit.approve"
        >
          {busy ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.primaryText}>
              {canApprove ? Strings.editApprove : Strings.editApproveDisabled}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={handleDelete}
          disabled={busy}
          style={[styles.danger, busy && styles.primaryDisabled]}
          testID="edit.delete"
        >
          <Text style={styles.dangerText}>{Strings.editDelete}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  onBlur?: () => void;
  testID?: string;
  keyboardType?: 'default' | 'number-pad' | 'url' | 'email-address';
  multiline?: boolean;
};

function Field({
  label,
  value,
  onChangeText,
  onBlur,
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
        onBlur={onBlur}
        keyboardType={keyboardType}
        multiline={multiline}
        testID={testID}
      />
    </View>
  );
}

// Helper used by the test to ensure each test starts with a fresh
// memoized store. Exported to keep test files free of internal imports.
export { __resetReviewQueueStoreForTest };

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  title: { fontSize: 26, fontWeight: 'bold', color: colors.text, marginBottom: spacing.lg },
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
  categoryPicker: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
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
  publishRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  publishBody: { flex: 1, marginRight: spacing.md },
  publishTitle: { fontSize: 15, fontWeight: 'bold', color: colors.text },
  publishHint: { fontSize: 13, color: colors.muted, marginTop: spacing.xs },
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
    marginBottom: spacing.md,
  },
  primaryDisabled: { opacity: 0.5 },
  primaryText: { color: colors.surface, fontSize: 16, fontWeight: 'bold' },
  danger: {
    backgroundColor: colors.surface,
    borderColor: colors.error,
    borderWidth: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  dangerText: { color: colors.error, fontSize: 15, fontWeight: 'bold' },
});

