// app/_layout.tsx — root layout, first-launch routing, and DB lifecycle.
//
// Per Design §11 the mount sequence is:
//   1. `openDB()` + `runMigrations()` — on failure, route to `/blocked`
//      and present the `almacenamiento-error` catalog entry.
//   2. `loadCredentials()` — if null, route to `/onboarding`.
//   3. If present, route to `/(tabs)/capture`.
//
// The decision is rendered as a state machine:
//   - 'loading'   → splash placeholder (no UI shown; just the Stack)
//   - 'blocked'   → render the `almacenamiento-error` card via Stack
//   - 'onboarding'→ render the onboarding screen
//   - 'tabs'      → render the tab navigator
//
// We use a `Stack` with explicit screens (no auto-routing) so the
// decision is in one place and is unit-testable via the same state
// machine.

import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { openDB, runMigrations } from '@/db';
import { loadCredentials } from '@/services/credentials';
import { presentError } from '@/error-presentation';
import { colors } from '@/ui/theme';

type Route = 'loading' | 'blocked' | 'onboarding' | 'tabs';

export default function RootLayout(): React.ReactElement {
  const [route, setRoute] = useState<Route>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await openDB();
        await runMigrations(db);
        const creds = await loadCredentials();
        if (cancelled) return;
        setRoute(creds ? 'tabs' : 'onboarding');
      } catch (err) {
        if (cancelled) return;
        setRoute('blocked');
        // Re-surface through the presenter so the dev console carries
        // a correlationId; the UI itself doesn't render the raw error.
        presentError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        {route === 'loading' ? (
          <Stack.Screen name="index" />
        ) : null}
        {route === 'blocked' ? (
          <Stack.Screen name="blocked" />
        ) : null}
        {route === 'onboarding' ? (
          <Stack.Screen name="onboarding" />
        ) : null}
        {route === 'tabs' ? (
          // WU-3 replaces the placeholder with the real
          // `(tabs)/capture` screen. Until then, route to the
          // WU-1 index placeholder.
          <Stack.Screen name="index" />
        ) : null}
      </Stack>
      {route === 'loading' ? (
        <View style={styles.splash} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.muted} />
        </View>
      ) : null}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
});
