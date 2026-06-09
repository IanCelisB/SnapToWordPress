// app/(tabs)/_layout.tsx — placeholder for the tab navigator.
//
// WU-3 replaces this with the real tab bar (Capture / Cola / Sync /
// Ajustes). For now, this just renders a Stack with the settings
// screen so the orchestrator's WU-2 brief is satisfied.

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function TabsLayout(): React.ReactElement {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="settings" />
      </Stack>
    </>
  );
}
