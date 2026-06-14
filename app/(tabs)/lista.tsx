// app/(tabs)/lista.tsx — the review-queue list (WU-3,
// review-queue spec R1-R2 + R5-R6).
//
// Top: status pill counts (pending, ready, syncing). Middle: a
// FlatList of products. Each row shows the thumbnail, name, price,
// category, and a `StatusPill`. Tap → edit screen. Long-press →
// delete confirmation.
//
// Implementation note: this screen used to wrap the Zustand store in
// a discriminated union and call `storeState.store(selector)` on the
// rendered paths. The Zustand hook is itself a React hook (it uses
// useSyncExternalStore internally), and calling it inside a
// conditional branch violates the rules of hooks. We now bypass the
// store and query the DB directly via the repos — same data, no
// conditional hooks, no rules-of-hooks violations on web.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { countByStatus } from '@/stores/reviewQueueStore';
import { imagesRepo, productsRepo } from '@/db/repos';
import { openDB } from '@/db';
import { presentError, type CatalogEntry } from '@/error-presentation';
import { Strings } from '@/ui/strings';
import { Card, EmptyState, ErrorCard, Header } from '@/ui/primitives';
import { StatusPill } from '@/ui/components/StatusPill';
import { SyncBanner } from '@/ui/components/SyncBanner';
import { colors, radius, spacing, typography } from '@/ui/theme';
import { removeImageFile } from '@/services/image-persistence';
import type { Product, ProductImage } from '@/domain/types';

export default function QueueList(): React.ReactElement {
  const router = useRouter();
  const [products, setProducts] = useState<ReadonlyArray<Product>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<CatalogEntry | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await openDB();
        const list = await productsRepo.listAll(db);
        if (!cancelled) {
          setProducts(list);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(presentError(err));
          setIsLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isLoading) return;
    let cancelled = false;
    (async () => {
      try {
        const db = await openDB();
        const map: Record<string, string | null> = {};
        for (const p of products) {
          const imgs: ReadonlyArray<ProductImage> =
            await imagesRepo.listForProduct(db, p.localId);
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
  }, [isLoading, products]);

  const handleSelect = useCallback(
    (id: string) => {
      router.push({ pathname: '/(tabs)/lista-detalle/[id]', params: { id } });
    },
    [router],
  );

  const handleDelete = useCallback(
    (id: string) => {
      const handleConfirm = async () => {
        try {
          const db = await openDB();
          const imgs = await imagesRepo.listForProduct(db, id);
          await Promise.all(
            imgs
              .map((i) => i.filePath)
              .filter((p): p is string => p.length > 0)
              .map((p) => removeImageFile(p)),
          );
          await productsRepo.delete(db, id);
          setProducts((prev) => prev.filter((p) => p.localId !== id));
        } catch (err) {
          setError(presentError(err));
        }
      };
      // Native Alert.alert — confirmed to work on web via a polyfill
      // in the root layout. Keep this for now; replace with an
      // in-app modal later if needed.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Alert } = require('react-native');
      Alert.alert(
        Strings.editDeleteConfirmTitle,
        Strings.editDeleteConfirmMessage,
        [
          { text: Strings.editDeleteConfirmNo, style: 'cancel' },
          {
            text: Strings.editDeleteConfirmYes,
            style: 'destructive',
            onPress: handleConfirm,
          },
        ],
      );
    },
    [],
  );

  const counts = countByStatus(products);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Header title={Strings.queueTitle} compact />
        <Text style={styles.counts} testID="queue.counts">
          {counts.pending} {Strings.queueCountsPending}
          {Strings.queueCountSeparator}
          {counts.ready} {Strings.queueCountsReady}
          {Strings.queueCountSeparator}
          {counts.syncing} {Strings.queueCountsSyncing}
        </Text>
      </View>

      <View style={styles.body}>
        <SyncBanner />

        {error ? (
          <ErrorCard
            title={error.title}
            message={error.message}
            testID="queue.error"
          />
        ) : null}

        {isLoading && products.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.muted} />
          </View>
        ) : products.length === 0 ? (
          <EmptyState
            icon="📦"
            title={Strings.queueEmpty}
            hint={Strings.queueEmptyHint}
            testID="queue.empty"
          />
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
      </View>
    </SafeAreaView>
  );
}

type QueueRowProps = {
  product: Product;
  thumbnailUri: string | null;
  onPress?: () => void;
  onDelete?: () => void;
};

function QueueRow({
  product,
  thumbnailUri,
  onPress,
  onDelete,
}: QueueRowProps): React.ReactElement {
  return (
    <Card onPress={onPress} padding="md" testID={`queue.row.${product.localId}`}>
      <View style={styles.row}>
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
        {onDelete ? (
          <Pressable onPress={onDelete} style={styles.deleteHint}>
            <Text style={styles.deleteHintText}>×</Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { padding: spacing.lg, paddingBottom: spacing.sm },
  body: { flex: 1, paddingHorizontal: spacing.lg },
  counts: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { gap: spacing.sm, paddingBottom: spacing.xl },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.line,
  },
  thumbPlaceholder: { backgroundColor: colors.surfaceMuted },
  rowBody: { flex: 1, gap: spacing.xs },
  rowName: { ...typography.bodyEmphasis, color: colors.text },
  rowMeta: { ...typography.caption, color: colors.textMuted },
  deleteHint: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteHintText: {
    fontSize: 20,
    color: colors.textMuted,
    lineHeight: 22,
  },
});
