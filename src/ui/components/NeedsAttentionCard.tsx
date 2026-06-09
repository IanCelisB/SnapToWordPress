// src/ui/components/NeedsAttentionCard.tsx — card shown on
// capture/queue screens when products are stuck (WU-5 task 5.4).
//
// Displays "{n} productos no se pudieron subir - tocá para ver".
// Tapping navigates to the sync screen. Hidden when blockedCount is 0.

import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSyncStore } from '../../stores/syncStore';
import { Strings } from '../strings';
import { colors, radius, spacing } from '../theme';

export function NeedsAttentionCard(): React.ReactElement | null {
  const router = useRouter();
  const store = useSyncStore();
  const blockedCount = store((s) => s.blockedCount);

  const handlePress = useCallback(() => {
    router.push('/sync');
  }, [router]);

  if (blockedCount <= 0) return null;

  return (
    <Pressable
      onPress={handlePress}
      style={styles.card}
      accessibilityRole="button"
      testID="needs-attention-card"
    >
      <View style={styles.content}>
        <Text style={styles.title}>
          {Strings.needsAttentionTitle.replace('{n}', String(blockedCount))}
        </Text>
        <Text style={styles.hint}>{Strings.needsAttentionHint}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.warning + '14',
    borderColor: colors.warning + '40',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  content: {
    gap: spacing.xs,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  hint: {
    fontSize: 12,
    color: colors.muted,
  },
});
