// src/ui/components/ProgressLine.tsx — shows sync progress with
// ActivityIndicator (WU-5 task 5.4).
//
// Displays "Subiendo producto 3 de 12…" with a spinner.
// Hidden when the worker is not running or progress is null.

import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSyncStore } from '../../stores/syncStore';
import { Strings } from '../strings';
import { colors, radius, spacing } from '../theme';

export function ProgressLine(): React.ReactElement | null {
  const store = useSyncStore();
  const status = store((s) => s.status);
  const progress = store((s) => s.progress);

  if (status !== 'running' || progress === null) return null;

  const text = Strings.progressLine
    .replace('{current}', String(progress.current))
    .replace('{total}', String(progress.total));

  return (
    <View style={styles.container} testID="progress-line">
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderColor: colors.line,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  text: {
    fontSize: 15,
    color: colors.text,
    flex: 1,
  },
});
