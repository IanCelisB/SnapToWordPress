// app/_layout.tsx — root layout and DB lifecycle.
//
// Per Design §11 the mount sequence is:
//   1. `openDB()` + `runMigrations()` — on failure, route to `/blocked`
//      and present the `almacenamiento-error` catalog entry.
//   2. Wire the sync trigger (the user lands on the home menu
//      regardless of credential state — the activities themselves
//      block actions that need credentials, see the sync screen).
//   3. Route to `/` (the home menu).
//
// We use a `Stack` with all screens registered up-front, and
// `router.replace()` to switch between them. The first registered
// screen is shown synchronously while the DB init runs in the
// background — so the user sees the home within a frame, not a
// blank page.
//
// The `bootStage` string is rendered to the page at all times so we
// can see exactly where the mount sequence is stuck (it lives in a
// dev-only `<Text>` at the bottom; harmless in production).

import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { openDB, runMigrations } from '@/db';
import { presentError } from '@/error-presentation';
import { colors } from '@/ui/theme';
import { createSyncTrigger } from '@/sync/sync-trigger';
import { createDefaultNetworkObserver } from '@/sync/network-observer';
import { useSyncStore } from '@/stores/syncStore';
import { useErrorStore } from '@/stores/error-store';

type Route = 'loading' | 'blocked' | 'home';

export default function RootLayout(): React.ReactElement {
  const [route, setRoute] = useState<Route>('loading');
  const [bootStage, setBootStage] = useState<string>('mount');
  const [bootError, setBootError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let trigger: ReturnType<typeof createSyncTrigger> | null = null;

    (async () => {
      try {
        setBootStage('openDB');
        const db = await openDB();
        if (cancelled) return;

        setBootStage('runMigrations');
        await runMigrations(db);
        if (cancelled) return;

        // Wire the sync trigger unconditionally. The trigger itself
        // is defensive — if no credentials are saved it will refuse
        // to start the worker (see `sync-trigger.ts`). The activities
        // that need credentials (the sync screen) show a calm notice
        // with a CTA to Settings; the user is never blocked from
        // reaching the main menu.
        setBootStage('syncTrigger.init');
        const observer = createDefaultNetworkObserver();
        const syncStore = useSyncStore();
        const errorStore = useErrorStore();

        trigger = createSyncTrigger({
          db,
          observer,
          onEvent: (event) => {
            syncStore.getState().applyEvent(event);
            errorStore.getState().addEvent(event);
          },
        });

        globalThis.__etiquetadorSyncTrigger = {
          startManual: trigger.startManual,
          isPaused: trigger.isPaused,
          setPaused: trigger.setPaused,
        };

        await trigger.init();
        if (cancelled) return;

        setBootStage('route:home');
        setRoute('home');

      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error
          ? `${err.name}: ${err.message}`
          : String(err);
        setBootError(`${bootStage} -> ${msg}`);
        setRoute('blocked');
        presentError(err);
      }
    })();
    return () => {
      cancelled = true;
      if (trigger) {
        trigger.dispose();
        globalThis.__etiquetadorSyncTrigger = undefined;
      }
    };
  }, []);

  // Navigate via the router when route changes. Stack.Screen
  // components stay registered (see file header).
  useEffect(() => {
    if (route === 'loading') return;
    // After the boot sequence finishes the user lands on the home
    // menu (`/`). The activities (Capturar, Cola, Sincronización,
    // Ajustes) are reached from the home cards.
    const target = route === 'home' ? '/' : `/${route}`;
    try {
      setBootStage(`navigate:${target}`);
      router.replace(target as never);
    } catch (err) {
      setBootError(err instanceof Error ? `${err.name}: ${err.message}` : String(err));
    }
  }, [route, router]);

  // Visible boot-error overlay. If anything in the mount sequence
  // throws, we surface it on the page instead of leaving it blank.
  if (bootError) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <View style={styles.errorBox}>
          <Text style={styles.errorTitle}>Boot error</Text>
          <Text style={styles.errorBody} testID="boot.error">
            {bootError}
          </Text>
          <Text style={styles.errorHint}>
            Stage: {bootStage} — revisá la consola del dev server para más detalle.
          </Text>
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="blocked" />
        <Stack.Screen name="(tabs)" />
      </Stack>
      {route === 'loading' ? (
        <View style={styles.splash} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.muted} />
        </View>
      ) : null}
      {/* Dev-only stage indicator. Always visible at the bottom so
          we can see exactly where the mount sequence is stuck.
          Invisible on dark backgrounds — high z-index white pill. */}
      <View style={styles.stagePill} pointerEvents="none">
        <Text style={styles.stageText} testID="boot.stage">
          {bootStage}
        </Text>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  errorBox: {
    flex: 1,
    padding: 24,
    backgroundColor: colors.bg,
    justifyContent: 'center',
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#B91C1C',
    marginBottom: 8,
  },
  errorBody: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#1A1A1A',
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E5E0',
  },
  errorHint: {
    fontSize: 12,
    color: '#6B6B6B',
    marginTop: 12,
  },
  stagePill: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: '#1A1A1A',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 9999,
  },
  stageText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontFamily: 'monospace',
  },
});
