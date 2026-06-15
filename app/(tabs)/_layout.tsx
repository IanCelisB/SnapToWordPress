// app/(tabs)/_layout.tsx — bottom-tab navigator with a custom tab
// bar (3 items: Capturar / Cola / Ajustes).
//
// We pass a custom `tabBar` to <Tabs> instead of using the default
// chrome — the default is too rigid to support the rounded-top
// shape with real Ionicons.
//
// The user lands on the main menu as soon as the app boots; the
// activities themselves show a calm notice when they need WC
// credentials configured in Settings (see the sync screen).

import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppTabBar } from '@/ui/components/AppTabBar';

export default function TabsLayout(): React.ReactElement {
  return (
    <>
      <StatusBar style="dark" />
      <Tabs
        screenOptions={{
          headerShown: false,
        }}
        tabBar={(props) => (
          <AppTabBar
            {...props}
            items={[
              { name: 'capturar', label: 'Capturar', icon: '📷' },
              { name: 'lista', label: 'Cola', icon: '📋' },
              { name: 'settings', label: 'Ajustes', icon: '⚙️' },
            ]}
          />
        )}
      >
        <Tabs.Screen name="capturar" />
        <Tabs.Screen name="lista" />
        <Tabs.Screen name="settings" />
      </Tabs>
    </>
  );
}
