// app/(tabs)/settings.tsx — store-config settings + sign out.
//
// Per Design §11 the screen shows:
//   - the current store URL (read-only),
//   - "Reconectar tienda" (re-runs `validateAndSave` with the current
//     creds),
//   - "Reemplazar credenciales" (re-opens the onboarding form pre-filled
//     with the current values),
//   - a calm storage usage line read from `file-system.getDirSize()`.
//
// "Sign out" clears the secure store but INTENTIONALLY keeps the local
// DB so the user can re-link the same store without losing pending
// products. This matches the orchestrator's WU-2 brief.

import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { presentError, type CatalogEntry } from '@/error-presentation';
import {
  clearCredentials,
  loadCredentials,
  revalidate,
  validateAndSave,
} from '@/services/credentials';
import { getDirSize, type DirSize } from '@/infra/file-system';
import { Strings } from '@/ui/strings';
import { Button, FieldRow, Header, Input, Section } from '@/ui/primitives';
import { colors, spacing, typography } from '@/ui/theme';

type Mode = 'idle' | 'reconnecting' | 'replacing' | 'signing-out';

export default function Settings(): React.ReactElement {
  const router = useRouter();
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const [hasCreds, setHasCreds] = useState(false);
  const [dirSize, setDirSize] = useState<DirSize | null>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const [error, setError] = useState<CatalogEntry | null>(null);

  // Replace form (pre-filled)
  const [replaceUrl, setReplaceUrl] = useState('');
  const [replaceKey, setReplaceKey] = useState('');
  const [replaceSecret, setReplaceSecret] = useState('');
  const [replaceError, setReplaceError] = useState<string | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        const creds = await loadCredentials();
        setHasCreds(creds !== null);
        setStoreUrl(creds?.baseUrl ?? null);
        setReplaceUrl(creds?.baseUrl ?? '');
        setReplaceKey(creds?.key ?? '');
        setReplaceSecret('');
      } catch {
        setHasCreds(false);
        setStoreUrl(null);
      }
      try {
        setDirSize(await getDirSize());
      } catch {
        setDirSize({ bytes: 0, megabytes: 0, fileCount: 0 });
      }
    })();
  }, []);

  const handleReconnect = useCallback(async () => {
    setError(null);
    setMode('reconnecting');
    try {
      const result = await revalidate();
      if (!result.ok) {
        setError(presentError(result.classification));
      }
    } catch (err) {
      setError(presentError(err));
    } finally {
      setMode('idle');
    }
  }, []);

  const handleReplace = useCallback(async () => {
    setError(null);
    setReplaceError(undefined);
    if (!replaceUrl.trim() || !replaceKey.trim() || !replaceSecret.trim()) {
      setReplaceError('Completá todos los campos');
      return;
    }
    setMode('replacing');
    try {
      const result = await validateAndSave({
        baseUrl: replaceUrl,
        key: replaceKey,
        secret: replaceSecret,
      });
      if (result.ok) {
        setStoreUrl(result.normalizedUrl);
        setReplaceUrl(result.normalizedUrl);
        setHasCreds(true);
        setReplaceSecret('');
        return;
      }
      setError(presentError(result.classification));
    } catch (err) {
      setError(presentError(err));
    } finally {
      setMode('idle');
    }
  }, [replaceUrl, replaceKey, replaceSecret]);

  const handleSignOut = useCallback(async () => {
    setError(null);
    setMode('signing-out');
    try {
      await clearCredentials();
      setHasCreds(false);
      setStoreUrl(null);
      router.replace('/onboarding');
    } finally {
      setMode('idle');
    }
  }, [router]);

  if (!hasCreds) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={typography.h2}>Sin tienda vinculada</Text>
          <Text style={styles.muted}>
            Volvé a la pantalla de bienvenida para conectar una tienda.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Header title="Ajustes" compact />

        {/* Tienda actual */}
        <Section title="Tienda actual" testID="settings.section.store">
          <FieldRow label="URL" value={storeUrl ?? '—'} testID="settings.url" />
          <Button
            label="Reconectar tienda"
            onPress={handleReconnect}
            loading={mode === 'reconnecting'}
            disabled={mode !== 'idle'}
            variant="secondary"
            fullWidth
            testID="settings.reconnect"
            style={styles.reconnect}
          />
        </Section>

        {/* Reemplazar credenciales */}
        <Section title="Reemplazar credenciales" testID="settings.section.replace">
          <Input
            label="URL"
            value={replaceUrl}
            onChangeText={setReplaceUrl}
            placeholder="https://mitienda.com"
            autoCapitalize="none"
            autoCorrect={false}
            testID="settings.replace.url"
          />
          <Input
            label="Consumer Key"
            value={replaceKey}
            onChangeText={setReplaceKey}
            placeholder="ck_xxxxx"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            testID="settings.replace.key"
          />
          <Input
            label="Consumer Secret"
            value={replaceSecret}
            onChangeText={setReplaceSecret}
            placeholder="cs_xxxxx"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            testID="settings.replace.secret"
            errorText={replaceError}
          />
          <Button
            label="Guardar"
            onPress={handleReplace}
            loading={mode === 'replacing'}
            disabled={mode !== 'idle'}
            variant="primary"
            fullWidth
            testID="settings.replace.submit"
            style={styles.submit}
          />
        </Section>

        {/* Almacenamiento */}
        <Section title="Almacenamiento" testID="settings.section.storage">
          <Text style={styles.muted}>
            {dirSize
              ? `~${dirSize.megabytes} MB usados para fotos`
              : 'Calculando…'}
          </Text>
          <Text style={styles.mutedSmall}>
            Los productos pendientes quedan guardados aunque cierres la app.
          </Text>
        </Section>

        {/* Cerrar sesión */}
        <Section title="Cerrar sesión" testID="settings.section.signout">
          <Text style={styles.muted}>
            Vamos a borrar las credenciales. Los productos que todavía no
            subiste siguen en el teléfono, no se pierden.
          </Text>
          <Button
            label="Cerrar sesión"
            onPress={handleSignOut}
            loading={mode === 'signing-out'}
            disabled={mode !== 'idle'}
            variant="danger"
            fullWidth
            testID="settings.signout"
            style={styles.signout}
          />
        </Section>

        {error ? (
          <View style={styles.errorCard} testID="settings.error">
            <Text style={styles.errorTitle}>{error.title}</Text>
            <Text style={styles.errorMessage}>{error.message}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  muted: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 20 },
  mutedSmall: { ...typography.caption, color: colors.textMuted, marginTop: -spacing.xs },
  reconnect: { marginTop: spacing.md },
  submit: { marginTop: spacing.sm },
  signout: { marginTop: spacing.md },
  errorCard: {
    backgroundColor: colors.errorSoft,
    borderColor: colors.error,
    borderWidth: 1,
    borderRadius: 10,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  errorTitle: {
    ...typography.bodyEmphasis,
    color: colors.error,
    marginBottom: spacing.xs,
  },
  errorMessage: {
    ...typography.caption,
    color: colors.text,
    lineHeight: 20,
  },
});
