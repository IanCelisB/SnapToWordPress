// app/(tabs)/queue/index.tsx — the review-queue list (WU-3,
// review-queue spec R1-R2 + R5-R6).
//
// Top: status pill counts (pending, ready, syncing, synced,
// needs-attention). Middle: a FlatList of products. Each row shows
// the thumbnail (first image), name, price, category, and a
// `StatusPill`. Tap → edit screen. Long-press → delete confirmation.
//
// All Spanish strings come from `src/ui/strings.ts` and the
// error-presentation catalog.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  countByStatus,
  useReviewQueueStore,
} from '@/stores/reviewQueueStore';
import { imagesRepo } from '@/db/repos';
import { openDB } from '@/db';
import { presentError, type CatalogEntry } from '@/error-presentation';
import { Strings } from '@/ui/strings';
import { StatusPill } from '@/ui/components/StatusPill';
import { SyncBanner } from '@/ui/components/SyncBanner';
import { colors, radius, spacing } from '@/ui/theme';
import { removeImageFile } from '@/services/image-persistence';
import type { Product, ProductImage } from '@/domain/types';

export default function QueueList(): React.ReactElement {
  const router = useRouter();
  const [store, setStore] = useState<Awaited<
    ReturnType<typeof useReviewQueueStore>
  > | null>(null);
  const [error, setError] = useState<CatalogEntry | null>(null);
  const [thumbnails, setThumbnails] = useState<
    Record<string, string | null>
  >({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await useReviewQueueStore();
      if (cancelled) return;
      setStore(s);
      await s.getState().load();
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Refresh thumbnails whenever the list changes.
  useEffect(() => {
    if (!store) return;
    const products = store((s) => s.products);
    let cancelled = false;
    (async () => {
      try {
        const db = await openDB();
        const map: Record<string, string | null> = {};
        for (const p of products) {
          const imgs: ReadonlyArray<ProductImage> = await imagesRepo.listForProduct(
            db,
            p.localId,
          );
          const first = imgs[0];
          map[p.localId] = first ? first.filePath : null;
        }
        if (!cancelled) {
          setThumbnails(map);
        }
      } catch {
        // Silent: thumbnails are a cosmetic touch.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store, store ? store((s) => s.products) : null]);

  const products = store ? store((s) => s.products) : [];
  const isLoading = store ? store((s) => s.isLoading) : false;
  const counts = countByStatus(products);

  const handleSelect = useCallback(
    (id: string) => {
      router.push({ pathname: '/(tabs)/queue/[id]', params: { id } });
    },
    [router],
  );

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert(
        Strings.editDeleteConfirmTitle,
        Strings.editDeleteConfirmMessage,
        [
          { text: Strings.editDeleteConfirmNo, style: 'cancel' },
          {
            text: Strings.editDeleteConfirmYes,
            style: 'destructive',
            onPress: async () => {
              try {
                const db = await openDB();
                // Remove the on-disk files first, then the DB row.
                const imgs = await imagesRepo.listForProduct(db, id);
                await Promise.all(
                  imgs
                    .map((i) => i.filePath)
                    .filter((p): p is string => p.length > 0)
                    .map((p) => removeImageFile(p)),
                );
                await store?.getState().delete(id);
              } catch (err) {
                setError(presentError(err));
              }
            },
          },
        ],
      );
    },
    [store],
  );

  if (!store) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.muted} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.title}>{Strings.queueTitle}</Text>
        <Text style={styles.counts} testID="queue.counts">
          {counts.pending} {Strings.queueCountsPending}
          {Strings.queueCountSeparator}
          {counts.ready} {Strings.queueCountsReady}
          {Strings.queueCountSeparator}
          {counts.syncing} {Strings.queueCountsSyncing}
        </Text>
      </View>

      <SyncBanner />

      {error ? (
        <View style={styles.errorCard} testID="queue.error">
          <Text style={styles.errorTitle}>{error.title}</Text>
          <Text style={styles.errorMessage}>{error.message}</Text>
        </View>
      ) : null}

      {isLoading && products.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.muted} />
        </View>
      ) : products.length === 0 ? (
        <View style={styles.empty} testID="queue.empty">
          <Text style={styles.emptyText}>{Strings.queueEmpty}</Text>
          <Text style={styles.emptyHint}>{Strings.queueEmptyHint}</Text>
        </View>
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => p.localId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <QueueRow
              product={item}
              thumbnailUri={thumbnails[item.localId] ?? null}
              onPress={() => handleSelect(item.localId)}
              onDelete={() => handleDelete(item.localId)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

type QueueRowProps = {
  product: Product;
  thumbnailUri: string | null;
  onPress: () => void;
  onDelete: () => void;
};

function QueueRow({
  product,
  thumbnailUri,
  onPress,
  onDelete,
}: QueueRowProps): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onDelete}
      style={styles.row}
      testID={`queue.row.${product.localId}`}
    >
      {thumbnailUri ? (
        <Image source={{ uri: thumbnailUri }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbPlaceholder]} />
      )}
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>
          {product.name}
        </Text>
        <Text style={styles.rowMeta}>
          {`$${product.price.toLocaleString('es-AR')}`}
          {product.categoryName ? ` · ${product.categoryName}` : ''}
        </Text>
        <StatusPill
          status={product.status}
          priceConfirmed={product.priceConfirmed}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  title: { fontSize: 26, fontWeight: 'bold', color: colors.text },
  counts: { fontSize: 13, color: colors.muted, marginTop: spacing.xs },
  list: { padding: spacing.lg, paddingTop: spacing.sm, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: radius.sm,
    backgroundColor: colors.line,
  },
  thumbPlaceholder: { backgroundColor: colors.line },
  rowBody: { flex: 1, gap: spacing.xs },
  rowName: { fontSize: 16, fontWeight: 'bold', color: colors.text },
  rowMeta: { fontSize: 13, color: colors.muted },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  emptyText: { color: colors.text, fontSize: 16, marginBottom: spacing.xs },
  emptyHint: { color: colors.muted, fontSize: 14, textAlign: 'center' },
  errorCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  errorTitle: { fontSize: 16, fontWeight: 'bold', color: colors.error, marginBottom: spacing.xs },
  errorMessage: { fontSize: 14, color: colors.text, lineHeight: 20 },
});

