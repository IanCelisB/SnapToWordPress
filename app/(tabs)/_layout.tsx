// app/(tabs)/_layout.tsx — bottom-tab navigator with a custom tab
// bar (4 items: Capturar / Cola / Home / Ajustes).
//
// We pass a custom `tabBar` to <Tabs> instead of using the default
// chrome — the default is too rigid to support the rounded-top
// shape with real Ionicons.
//
// The Home item is a CUSTOM ACTION (not a registered tab) — it
// uses `useRouter().push('/')` to navigate to the home menu at
// the root, since the home menu lives at `app/index.tsx` and
// can't be a Tabs.Screen (Tabs can only contain files inside the
// (tabs) group).

import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AppTabBar, useHomeTabBarItem } from '@/ui/components/AppTabBar';

export default function TabsLayout(): React.ReactElement {
  const homeItem = useHomeTabBarItem();
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
              homeItem,
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
