// app/index.tsx — home / inicio de la app.
//
// Cuatro cards grandes con icono + label + subtítulo. Cada card
// navega a la pantalla correspondiente. El home NO está dentro del
// (tabs) group, así que no tiene footer de tabs — es standalone.
// Cuando el usuario entra a un tab (Capturar / Cola / Ajustes) sí
// aparece el footer para volver al home con el back del sistema
// o navegando manualmente.
//
// La pantalla de Sincronización (`/sync`) tampoco es tab; se llega
// desde acá o desde el SyncBanner que aparece en Capturar y Cola.

import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, Header } from '@/ui/primitives';
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
    label: Strings.tabCapture,
    subtitle: Strings.homeMenuCaptureSubtitle,
    href: '/(tabs)/capturar',
    testID: 'home.menu.capturar',
    icon: '📷',
  },
  {
    label: Strings.tabQueue,
    subtitle: Strings.homeMenuQueueSubtitle,
    href: '/(tabs)/lista',
    testID: 'home.menu.cola',
    icon: '📋',
  },
  {
    label: Strings.tabSync,
    subtitle: Strings.homeMenuSyncSubtitle,
    href: '/sync',
    testID: 'home.menu.sync',
    icon: '🔄',
  },
  {
    label: Strings.tabSettings,
    subtitle: Strings.homeMenuSettingsSubtitle,
    href: '/(tabs)/settings',
    testID: 'home.menu.settings',
    icon: '⚙️',
  },
];

export default function Home(): React.ReactElement {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Header
          title={Strings.homeTitle}
          subtitle={Strings.homeSubtitle}
          testID="home.header"
        />

        <View style={styles.menu}>
          {MENU.map((item) => (
            <Card
              key={item.href}
              onPress={() => router.push(item.href as never)}
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
    fontSize: 36,
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
