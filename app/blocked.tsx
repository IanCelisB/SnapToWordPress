// app/blocked.tsx — error screen shown when DB init fails.
//
// Reached when `app/_layout.tsx` catches an error during `openDB()`
// or `runMigrations()`. We display a minimal placeholder so the
// navigator has a real screen to show — without it, expo-router
// throws on the `/blocked` route and the page stays blank.
//
// The full polished error UI is in `app/onboarding.tsx`-style
// (catalog-driven, localized). For now this is just enough to
// unblock the layout's `router.replace('/blocked')` call.

import { Text, View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '@/ui/theme';

export default function Blocked(): React.ReactElement {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.body}>
        <Text style={styles.title}>No se puede iniciar la app</Text>
        <Text style={styles.message}>
          Hubo un problema abriendo el almacenamiento local. Reintentá
          o reinstalá la app.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  body: {
    flex: 1,
    padding: spacing.xl,
    justifyContent: 'center',
    gap: spacing.md,
  },
  title: {
    ...typography.h2,
    color: '#B91C1C',
  },
  message: {
    ...typography.body,
    color: colors.textMuted,
  },
});
