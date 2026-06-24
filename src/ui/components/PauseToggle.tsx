// src/ui/components/PauseToggle.tsx — toggle switch for pausing/
// resuming sync (WU-5 task 5.4).
//
// Uses the sync-trigger's pause/unpause via the global accessor.
// Shows "Sincronización pausada" when paused.

import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSyncStore } from '../../stores/syncStore';
import { Strings } from '../strings';
import { colors, spacing } from '../theme';

export function PauseToggle(): React.ReactElement {
  const store = useSyncStore();
  const paused = store((s) => s.paused);

  const handleToggle = useCallback(async () => {
    const trigger = globalThis.__etiquetadorSyncTrigger;
    if (!trigger) return;
    const next = !paused;
    await trigger.setPaused(next);
    store.getState().setPaused(next);
  }, [paused, store]);

  return (
    <View style={styles.row} testID="pause-toggle">
      {paused ? (
        <Text style={styles.pausedLabel}>{Strings.pauseToggleLabel}</Text>
      ) : null}
      <Text style={styles.label}>
        {paused ? Strings.syncResume : Strings.syncPause}
      </Text>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: paused }}
        onPress={handleToggle}
        style={[
          styles.toggle,
          paused ? styles.toggleOn : styles.toggleOff,
        ]}
        testID="pause-toggle.switch"
      >
        <View
          style={[
            styles.knob,
            paused ? styles.knobOn : styles.knobOff,
          ]}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
  },
  pausedLabel: {
    fontSize: 13,
    color: colors.warning,
    fontWeight: '600',
  },
  label: {
    fontSize: 16,
    color: colors.text,
  },
  toggle: {
    width: 52,
    height: 30,
    borderRadius: 15,
    padding: 3,
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: colors.accent },
  toggleOff: { backgroundColor: colors.line },
  knob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  knobOn: { alignSelf: 'flex-end' },
  knobOff: { alignSelf: 'flex-start' },
});
