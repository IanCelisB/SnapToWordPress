// src/ui/components/AppTabBar.tsx — custom bottom-tab bar for the
// EtiquetadorDeProductos app.
//
// Layout: 3 corner items in a row (Capturar / Cola / Ajustes).
// Each item has an emoji icon + uppercase label. The bar has
// rounded top corners and a subtle top shadow for separation
// from the content area.
//
// Icon strategy: we use emoji (📸 📋 ⚙️) as placeholder
// icons. They are referential and zero-dependency. A future
// iteration can swap them for real icons (lucide-react-native or
// react-native-svg) without changing the tab bar structure.
//
// We render the tab bar ourselves (instead of using the default
// expo-router / React Navigation chrome) so we control every pixel
// of the shape — the default is too rigid to support a clean,
// three-corner layout with custom colors and a top-rounded bar.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '../theme';

// ─── Item shape ────────────────────────────────────────────────
// One tab in the bar. Each item has:
//   - `name` — the route name (used as the navigation target and
//     as a testID suffix).
//   - `label` — the text rendered below the icon (uppercase).
//   - `icon` — an emoji (or any short text) used as the icon. We
//     treat it as a Text node so it picks up the active color
//     via `opacity` rather than `color`, so emojis keep their
//     full color even when the tab is inactive.
//   - `onPress` — OPTIONAL. When provided, the item is treated as
//     a custom action rather than a tab. It doesn't track active
//     state, and pressing it calls this handler instead of
//     navigating. Use this for items that need to go to a route
//     outside the (tabs) group.

export type TabBarItem = {
  name: string;
  label: string;
  icon: string;
  onPress?: () => void;
};

// ─── AppTabBar ─────────────────────────────────────────────────
// Receives the React Navigation bottom-tabs props as a loose
// shape (we don't import the type from `@react-navigation/bottom-tabs`
// because that's a transitive dep — declaring it here avoids
// pulling in a new package and keeps the surface minimal).

// Loose types for the navigation contract. React Navigation's
// actual BottomTabBarProps has a stricter generic signature we
// don't need to mirror here — we only use `state`, `emit`, and
// `navigate`. The `any` on emit sidesteps a contravariance issue
// with the actual `keyof BottomTabNavigationEventMap` type.
type AppTabBarProps = {
  state: { index: number };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  navigation: any;
  items: ReadonlyArray<TabBarItem>;
};

export function AppTabBar({
  state,
  navigation,
  items,
}: AppTabBarProps): React.ReactElement {
  return (
    <SafeAreaView
      edges={['bottom']}
      style={styles.safeArea}
    >
      <View style={styles.bar}>
        {items.map((item, index) => {
          const isCustomAction = item.onPress !== undefined;
          const isActive = !isCustomAction && state.index === index;
          return (
            <Pressable
              key={item.name}
              onPress={() => {
                if (item.onPress) {
                  item.onPress();
                  return;
                }
                const event = navigation.emit({
                  type: 'tabPress',
                  target: item.name,
                  canPreventDefault: true,
                });
                if (!isActive && !event.defaultPrevented) {
                  navigation.navigate(item.name);
                }
              }}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              style={({ pressed }) => [
                styles.slot,
                pressed && { opacity: 0.6 },
              ]}
              testID={`tabbar.${item.name}`}
            >
              <Text
                style={[
                  styles.icon,
                  { opacity: isActive ? 1 : 0.6 },
                ]}
                allowFontScaling={false}
              >
                {item.icon}
              </Text>
              <Text
                style={[
                  styles.label,
                  { color: isActive ? colors.accent : colors.textMuted },
                ]}
                numberOfLines={1}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: 'transparent',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 8,
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    gap: spacing.xs,
  },
  icon: {
    fontSize: 22,
    lineHeight: 26,
  },
  label: {
    ...typography.micro,
  },
});
