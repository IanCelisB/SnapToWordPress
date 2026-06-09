// src/ui/screens/sync.tsx — the sync screen (WU-4 task 4.8 + Design
// §5 + sync-trigger spec).
//
// Layout (per the spec's "one primary action per screen" rule):
//   - Progress line at the top: "Subiendo producto N de M..."
//     only when the worker is running.
//   - Pause toggle: global, persisted in app_config.
//   - "Sincronizar ahora" primary button (disabled while running).
//   - Calm hint area: "No hay productos pendientes" /
//     "La sincronización está pausada" / "Esperando Wi-Fi".
//   - List of pending / active products (placeholder for v1).
//
// All strings come from `src/ui/strings.ts` — no inline Spanish
// literals, ever. The progress line uses a templated string with
// `{current}` / `{total}` placeholders.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSyncStore } from '../../stores/syncStore';
import { Strings } from '../strings';
import { colors, radius, spacing } from '../theme';

// The trigger instance is wired in `app/_layout.tsx`. The screen
// reads it via a global accessor that the layout sets at boot
// time. In tests, the screen is rendered without a trigger — the
// callbacks are no-ops in that case.

declare global {
  // eslint-disable-next-line no-var
  var __etiquetadorSyncTrigger: undefined | {
    startManual: () => Promise<{ succeeded: number; failed: number; paused: boolean }>;
    isPaused: () => Promise<boolean>;
    setPaused: (paused: boolean) => Promise<void>;
  };
}

export default function SyncScreen(): React.ReactElement {
  const store = useSyncStore();
  const status = store((s) => s.status);
  const progress = store((s) => s.progress);
  const paused = store((s) => s.paused);
  const blockedCount = store((s) => s.blockedCount);
  const lastSyncAt = store((s) => s.lastSyncAt);

  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // On mount, sync the local `paused` flag from the trigger.
    const trigger = globalThis.__etiquetadorSyncTrigger;
    if (!trigger) return;
    void trigger.isPaused().then((p) => {
      const state = store.getState();
      if (state.paused !== p) {
        state.setPaused(p);
      }
    });
  }, [store]);

  const handleSyncNow = useCallback(async () => {
    const trigger = globalThis.__etiquetadorSyncTrigger;
    if (!trigger || busy) return;
    setBusy(true);
    try {
      await trigger.startManual();
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const handleTogglePause = useCallback(async () => {
    const trigger = globalThis.__etiquetadorSyncTrigger;
    if (!trigger) return;
    const next = !paused;
    await trigger.setPaused(next);
    store.getState().setPaused(next);
  }, [paused, store]);

  const isRunning = status === 'running' || busy;
  const showProgress = isRunning && progress !== null;
  const progressText = showProgress
    ? Strings.syncSyncing
        .replace('{current}', String(progress?.current ?? 0))
        .replace('{total}', String(progress?.total ?? 0))
    : null;

  // Calm hint copy: the user is always told WHY the worker isn't
  // going. The actual error text (if any) is owned by the catalog
  // (via the auth-blocked / needs-attention store states), but the
  // "what to do" hints live here.
  const hint = (() => {
    if (paused) return Strings.syncPausedHint;
    if (status === 'auth-blocked') return Strings.syncAuthHint;
    if (status === 'needs-attention' && blockedCount > 0) {
      return Strings.syncNeedsAttentionHint;
    }
    if (status === 'idle') return Strings.syncCompletedHint;
    return null;
  })();

  return (
    <View style={styles.container} testID="sync.screen">
      <Text style={styles.title}>{Strings.syncTitle}</Text>

      {showProgress ? (
        <View style={styles.progressBox} testID="sync.progress">
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.progressText}>{progressText}</Text>
        </View>
      ) : null}

      {hint !== null ? (
        <Text style={styles.hint} testID="sync.hint">
          {hint}
        </Text>
      ) : null}

      {lastSyncAt !== null ? (
        <Text style={styles.lastSync}>
          {Strings.syncLast.replace('{at}', formatLastSync(lastSyncAt))}
        </Text>
      ) : null}

      <View style={styles.pauseRow}>
        <Text style={styles.pauseLabel}>
          {paused ? Strings.syncResume : Strings.syncPause}
        </Text>
        <Pressable
          accessibilityRole="switch"
          accessibilityState={{ checked: paused }}
          onPress={handleTogglePause}
          style={[
            styles.toggle,
            paused ? styles.toggleOn : styles.toggleOff,
          ]}
          testID="sync.pause.toggle"
        >
          <View
            style={[
              styles.toggleKnob,
              paused ? styles.toggleKnobOn : styles.toggleKnobOff,
            ]}
          />
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={isRunning || paused}
        onPress={handleSyncNow}
        style={[
          styles.primaryButton,
          (isRunning || paused) && styles.primaryButtonDisabled,
        ]}
        testID="sync.syncNow.button"
      >
        <Text style={styles.primaryButtonText}>
          {isRunning ? Strings.syncSyncingShort : Strings.syncSyncNow}
        </Text>
      </Pressable>
    </View>
  );
}

function formatLastSync(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < 60_000) return Strings.syncLastMoment;
  if (delta < 60 * 60_000) {
    const m = Math.floor(delta / 60_000);
    return Strings.syncLastMinutes.replace('{n}', String(m));
  }
  if (delta < 24 * 60 * 60_000) {
    const h = Math.floor(delta / (60 * 60_000));
    return Strings.syncLastHours.replace('{n}', String(h));
  }
  const d = Math.floor(delta / (24 * 60 * 60_000));
  return Strings.syncLastDays.replace('{n}', String(d));
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: spacing.lg,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  progressBox: {
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
  progressText: {
    fontSize: 15,
    color: colors.text,
    flex: 1,
  },
  hint: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: spacing.lg,
  },
  lastSync: {
    fontSize: 12,
    color: colors.muted,
    marginBottom: spacing.lg,
  },
  pauseRow: {
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
  pauseLabel: {
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
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  toggleKnobOn: { alignSelf: 'flex-end' },
  toggleKnobOff: { alignSelf: 'flex-start' },
  primaryButton: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: colors.line,
  },
  primaryButtonText: {
    color: colors.surface,
    fontWeight: 'bold',
    fontSize: 16,
  },
});
