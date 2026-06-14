// src/ui/components/SyncBanner.tsx — persistent sync-status banner
// (WU-4 task 4.6).
//
// Shown at the top of the capture and queue screens. Displays:
//   - Running: "Sincronizando X productos…"
//   - Blocked: "X productos necesitan atención"
//   - Otherwise: hidden
//
// Tap navigates to `/sync`. All strings from `src/ui/strings.ts`.
// Uses the new theme tokens + `errorCard`/`accentSoft` style.

import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSyncStore } from '../../stores/syncStore';
import { Strings } from '../strings';
import {
  colors,
  radius,
  spacing,
  typography,
} from '../theme';

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
        style={[styles.banner, styles.bannerRunning]}
        accessibilityRole="button"
        testID="sync-banner.running"
      >
        <View style={styles.content}>
          <Text style={[styles.text, { color: colors.info }]}>
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
          <Text style={[styles.text, { color: colors.error }]}>
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
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  bannerRunning: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  bannerBlocked: {
    borderColor: colors.error,
    backgroundColor: colors.errorSoft,
  },
  content: {
    gap: spacing.xs,
  },
  text: {
    ...typography.bodyEmphasis,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
