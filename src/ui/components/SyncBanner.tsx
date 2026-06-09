// src/ui/components/SyncBanner.tsx — persistent sync-status banner
// (WU-4 task 4.6).
//
// Shown at the top of the capture and queue screens. Displays:
//   - Running: "Sincronizando X productos…"
//   - Blocked: "X productos necesitan atención"
//   - Otherwise: hidden
//
// Tap navigates to `/sync`. All strings from `src/ui/strings.ts`.

import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSyncStore } from '../../stores/syncStore';
import { Strings } from '../strings';
import { colors, radius, spacing } from '../theme';

export function SyncBanner(): React.ReactElement | null {
  const router = useRouter();
  const store = useSyncStore();
  const status = store((s) => s.status);
  const progress = store((s) => s.progress);
  const blockedCount = store((s) => s.blockedCount);

  const handlePress = useCallback(() => {
    router.push('/sync');
  }, [router]);

  if (status === 'running' && progress !== null) {
    return (
      <Pressable
        onPress={handlePress}
        style={styles.banner}
        accessibilityRole="button"
        testID="sync-banner.running"
      >
        <View style={styles.content}>
          <Text style={styles.text}>
            {Strings.syncBannerRunning.replace(
              '{n}',
              String(progress.total),
            )}
          </Text>
          <Text style={styles.hint}>{Strings.syncBannerTapToSee}</Text>
        </View>
      </Pressable>
    );
  }

  if (status === 'needs-attention' && blockedCount > 0) {
    return (
      <Pressable
        onPress={handlePress}
        style={[styles.banner, styles.bannerBlocked]}
        accessibilityRole="button"
        testID="sync-banner.blocked"
      >
        <View style={styles.content}>
          <Text style={styles.text}>
            {Strings.syncBannerBlocked.replace(
              '{n}',
              String(blockedCount),
            )}
          </Text>
          <Text style={styles.hint}>{Strings.syncBannerTapToSee}</Text>
        </View>
      </Pressable>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.accent + '14',
    borderColor: colors.accent + '40',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  bannerBlocked: {
    backgroundColor: colors.warning + '14',
    borderColor: colors.warning + '40',
  },
  content: {
    gap: spacing.xs,
  },
  text: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  hint: {
    fontSize: 12,
    color: colors.muted,
  },
});
