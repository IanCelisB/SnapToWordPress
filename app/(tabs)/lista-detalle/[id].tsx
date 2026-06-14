// app/(tabs)/lista-detalle/[id].tsx — per-product review/edit screen
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
// Uses the new design tokens + primitive components.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
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
import { Button, Card, ErrorCard, FieldRow, Header, Input, Section } from '@/ui/primitives';
import { colors, radius, spacing, typography } from '@/ui/theme';
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
  const [categories, setCategories] = useState<ReadonlyArray<StoreCategory>>([]);
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
            <ErrorCard title={error.title} message={error.message} />
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
        <Header title={Strings.editTitle} compact />

        <Section title="Datos">
          <Input
            label="Nombre"
            value={name}
            onChangeText={setName}
            onBlur={handleNameBlur}
            placeholder={Strings.editFieldName}
            testID="edit.field.name"
            multiline
          />
          <Input
            label={Strings.editFieldPrice}
            value={price}
            onChangeText={handlePriceChange}
            placeholder="0"
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

          <Input
            label={Strings.editFieldDescription}
            value={description}
            onChangeText={setDescription}
            onBlur={handleDescriptionBlur}
            placeholder={Strings.editFieldDescription}
            testID="edit.field.description"
            multiline
          />
        </Section>

        <Section title="Publicación">
          <Card padding="md">
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
          </Card>
        </Section>

        {error ? (
          <ErrorCard title={error.title} message={error.message} testID="edit.error" />
        ) : null}

        <Button
          label={canApprove ? Strings.editApprove : Strings.editApproveDisabled}
          onPress={handleApprove}
          disabled={!canApprove || busy}
          loading={busy && canApprove}
          variant="primary"
          size="lg"
          fullWidth
          testID="edit.approve"
          style={styles.cta}
        />
        <Button
          label={Strings.editDelete}
          onPress={handleDelete}
          disabled={busy}
          variant="danger"
          fullWidth
          testID="edit.delete"
          style={styles.cta}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

// Helper used by the test to ensure each test starts with a fresh
// memoized store. Exported to keep test files free of internal imports.
export { __resetReviewQueueStoreForTest };

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  label: { ...typography.captionEmphasis, color: colors.textMuted, marginBottom: spacing.xs, marginTop: spacing.sm },
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
  publishRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  publishBody: { flex: 1, marginRight: spacing.md },
  publishTitle: { ...typography.bodyEmphasis, color: colors.text, marginBottom: spacing.xs },
  publishHint: { ...typography.caption, color: colors.textMuted, lineHeight: 18 },
  cta: { marginBottom: spacing.md },
});
