// src/ui/screens/sync.tsx — the sync screen (WU-4 task 4.8 + Design
// §5 + sync-trigger spec).
//
// Layout (per the spec's "one primary action per screen" rule):
//   - Header + subtitle at the top.
//   - Progress line: "Subiendo producto N de M..." when running.
//   - Pause toggle: global, persisted in app_config.
//   - "Sincronizar ahora" primary button (disabled while running).
//   - Calm hint area: "No hay productos pendientes" /
//     "La sincronización está pausada" / "Esperando Wi-Fi".
//
// All strings come from `src/ui/strings.ts` — no inline Spanish
// literals, ever. The progress line uses a templated string with
// `{current}` / `{total}` placeholders.
//
// Uses the new design tokens + primitive components.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSyncStore } from '../../stores/syncStore';
import { Strings } from '../strings';
import { Button, Card, Header } from '../primitives';
import { colors, radius, spacing, typography } from '../theme';

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
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Header
          title={Strings.syncTitle}
          subtitle="Revisá el estado de la sincronización con tu tienda."
        />

        {showProgress ? (
          <Card padding="md" testID="sync.progress" style={styles.progressCard}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.progressText}>{progressText}</Text>
          </Card>
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

        <Card padding="md" testID="sync.pause.card">
          <View style={styles.pauseRow}>
            <Text style={styles.pauseLabel}>
              {paused ? Strings.syncResume : Strings.syncPause}
            </Text>
            <Switch
              value={paused}
              onValueChange={handleTogglePause}
              testID="sync.pause.toggle"
            />
          </View>
        </Card>

        <Button
          label={isRunning ? Strings.syncSyncingShort : Strings.syncSyncNow}
          onPress={handleSyncNow}
          disabled={isRunning || paused}
          loading={isRunning}
          variant="primary"
          size="lg"
          fullWidth
          testID="sync.syncNow.button"
          style={styles.syncButton}
        />
      </ScrollView>
    </SafeAreaView>
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
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  progressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  progressText: {
    ...typography.bodyEmphasis,
    color: colors.text,
    flex: 1,
  },
  hint: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  lastSync: {
    ...typography.caption,
    color: colors.textDisabled,
    marginBottom: spacing.lg,
  },
  pauseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pauseLabel: {
    ...typography.bodyEmphasis,
    color: colors.text,
  },
  syncButton: {
    marginTop: spacing.xl,
  },
});
