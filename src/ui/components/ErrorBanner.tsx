// src/ui/components/ErrorBanner.tsx — dismissable banner showing
// the most recent error from the error store (WU-5 task 5.4).
//
// Displays error title + message from the error catalog. Calm palette.
// Dismissed by tapping the close button.

import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useErrorStore } from '../../stores/error-store';
import { ERROR_CATALOG } from '../../error-presentation';
import { Strings } from '../strings';
import { colors, radius, spacing } from '../theme';

export function ErrorBanner(): React.ReactElement | null {
  const store = useErrorStore();
  const errors = store((s) => s.errors);
  const clear = store((s) => s.clear);

  const handleDismiss = useCallback(() => {
    clear();
  }, [clear]);

  const latest = errors[0];
  if (!latest) return null;

  const catalog = ERROR_CATALOG[latest.key];
  if (!catalog) return null;

  return (
    <View style={styles.banner} testID="error-banner">
      <View style={styles.content}>
        <Text style={styles.title}>{catalog.title}</Text>
        <Text style={styles.message}>{catalog.message}</Text>
      </View>
      <Pressable
        onPress={handleDismiss}
        style={styles.dismiss}
        accessibilityLabel={Strings.errorBannerDismiss}
        testID="error-banner.dismiss"
      >
        <Text style={styles.dismissText}>{Strings.errorBannerDismiss}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.error + '14',
    borderColor: colors.error + '40',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  content: {
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.error,
  },
  message: {
    fontSize: 13,
    color: colors.text,
  },
  dismiss: {
    alignSelf: 'flex-end',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  dismissText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
});
