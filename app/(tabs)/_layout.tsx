// app/(tabs)/_layout.tsx — tab-navigator placeholder (WU-3).
//
// WU-3 wires the real screens (capture, queue, edit) but the actual
// bottom-tab visual is deferred to WU-5 polish. For now this is a
// Stack with the three screens so the spec rules around screen-level
// routing work.

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function TabsLayout(): React.ReactElement {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="capture" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="queue/index" />
        <Stack.Screen name="queue/[id]" />
      </Stack>
    </>
  );
}
