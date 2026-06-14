// app/index.tsx — home menu with cards linking to the main flows.
//
// The root layout (`app/_layout.tsx`) only renders this route during
// the initial loading state, then redirects to `/(tabs)`. This
// version is also useful when the user lands on `/` directly (e.g.
// browser refresh on the home URL) — it gives them a way to get to
// the rest of the app without typing the routes by hand.

import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  Card,
  Header,
} from '@/ui/primitives';
import { colors, spacing, typography } from '@/ui/theme';
import { Strings } from '@/ui/strings';

type MenuItem = {
  label: string;
  subtitle: string;
  href: '/' | '/(tabs)/capturar' | '/(tabs)/lista' | '/(tabs)/settings' | '/sync';
  testID: string;
  icon: string;
};

const MENU: ReadonlyArray<MenuItem> = [
  {
    label: Strings.captureTitle,
    subtitle: 'Capturar un producto nuevo',
    href: '/(tabs)/capturar',
    testID: 'home.menu.capturar',
    icon: '📸',
  },
  {
    label: Strings.queueTitle,
    subtitle: 'Ver la cola de productos pendientes',
    href: '/(tabs)/lista',
    testID: 'home.menu.lista',
    icon: '📋',
  },
  {
    label: 'Sincronización',
    subtitle: 'Revisar el estado de la sincronización',
    href: '/sync',
    testID: 'home.menu.sync',
    icon: '🔄',
  },
  {
    label: 'Ajustes',
    subtitle: 'Configurar la tienda y credenciales',
    href: '/(tabs)/settings',
    testID: 'home.menu.settings',
    icon: '⚙️',
  },
];

export default function Index() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Header
          title="Etiquetador de Productos"
          subtitle="Elegí una opción para empezar."
          testID="home.header"
        />

        <View style={styles.menu}>
          {MENU.map((item) => (
            <Card
              key={item.href}
              onPress={() => router.push(item.href)}
              padding="lg"
              testID={item.testID}
            >
              <View style={styles.menuRow}>
                <Text style={styles.menuIcon}>{item.icon}</Text>
                <View style={styles.menuText}>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                </View>
              </View>
            </Card>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingTop: spacing.xxl },
  menu: { gap: spacing.md },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  menuIcon: {
    fontSize: 28,
  },
  menuText: {
    flex: 1,
  },
  menuLabel: {
    ...typography.bodyEmphasis,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  menuSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
});
