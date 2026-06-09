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
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
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
import { colors, radius, spacing } from '@/ui/theme';

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

  useEffect(() => {
    (async () => {
      const creds = await loadCredentials();
      setHasCreds(creds !== null);
      setStoreUrl(creds?.baseUrl ?? null);
      setReplaceUrl(creds?.baseUrl ?? '');
      // We DO NOT pre-fill the secret — re-entering it is the safer
      // default. The user can paste the new one.
      setReplaceKey(creds?.key ?? '');
      setReplaceSecret('');
      setDirSize(await getDirSize());
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
    if (!replaceUrl.trim() || !replaceKey.trim() || !replaceSecret.trim()) {
      setError(
        presentError('datos-invalidos', { field: 'credenciales', reason: 'required' }),
      );
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
      // The local DB is INTENTIONALLY preserved. The user can re-link
      // the same store without losing pending products. The first-launch
      // routing will detect no creds on next mount and route to
      // /onboarding.
      router.replace('/onboarding');
    } finally {
      setMode('idle');
    }
  }, [router]);

  if (!hasCreds) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.title}>Sin tienda vinculada</Text>
          <Text style={styles.muted}>Volvé a la pantalla de bienvenida para conectar una tienda.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Ajustes</Text>

        <Section title="Tienda actual">
          <Text style={styles.url} testID="settings.url">{storeUrl ?? '—'}</Text>
          <Pressable
            onPress={handleReconnect}
            disabled={mode !== 'idle'}
            style={[styles.button, styles.buttonSecondary]}
            testID="settings.reconnect"
          >
            {mode === 'reconnecting' ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.buttonSecondaryText}>Reconectar tienda</Text>
            )}
          </Pressable>
        </Section>

        <Section title="Reemplazar credenciales">
          <FormRow
            label="URL"
            value={replaceUrl}
            onChangeText={setReplaceUrl}
            placeholder="https://mitienda.com"
            testID="settings.replace.url"
          />
          <FormRow
            label="Consumer Key"
            value={replaceKey}
            onChangeText={setReplaceKey}
            placeholder="ck_xxxxx"
            secure
            testID="settings.replace.key"
          />
          <FormRow
            label="Consumer Secret"
            value={replaceSecret}
            onChangeText={setReplaceSecret}
            placeholder="cs_xxxxx"
            secure
            testID="settings.replace.secret"
          />
          <Pressable
            onPress={handleReplace}
            disabled={mode !== 'idle'}
            style={[styles.button, styles.buttonPrimary]}
            testID="settings.replace.submit"
          >
            {mode === 'replacing' ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.buttonPrimaryText}>Guardar</Text>
            )}
          </Pressable>
        </Section>

        <Section title="Almacenamiento">
          <Text style={styles.muted}>
            {dirSize
              ? `~${dirSize.megabytes} MB usados para fotos`
              : 'Calculando…'}
          </Text>
          <Text style={styles.mutedSmall}>
            Los productos pendientes quedan guardados aunque cierres la app.
          </Text>
        </Section>

        <Section title="Cerrar sesión">
          <Text style={styles.muted}>
            Vamos a borrar las credenciales. Los productos que todavía no
            subiste siguen en el teléfono, no se pierden.
          </Text>
          <Pressable
            onPress={handleSignOut}
            disabled={mode !== 'idle'}
            style={[styles.button, styles.buttonDanger]}
            testID="settings.signout"
          >
            {mode === 'signing-out' ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.buttonDangerText}>Cerrar sesión</Text>
            )}
          </Pressable>
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function FormRow({
  label,
  value,
  onChangeText,
  placeholder,
  secure,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  secure?: boolean;
  testID?: string;
}): React.ReactElement {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        secureTextEntry={secure}
        autoCapitalize="none"
        autoCorrect={false}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  title: { fontSize: 26, fontWeight: '600', color: colors.text, marginBottom: spacing.lg },
  section: { marginBottom: spacing.xl },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  url: { fontSize: 16, color: colors.text, marginBottom: spacing.md },
  field: { marginBottom: spacing.md },
  label: { fontSize: 14, color: colors.muted, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  button: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonPrimaryText: { color: colors.surface, fontWeight: '600' },
  buttonSecondary: { backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1 },
  buttonSecondaryText: { color: colors.text },
  buttonDanger: { backgroundColor: colors.error },
  buttonDangerText: { color: colors.surface, fontWeight: '600' },
  muted: { fontSize: 14, color: colors.muted, marginBottom: spacing.md, lineHeight: 20 },
  mutedSmall: { fontSize: 12, color: colors.muted, marginTop: -spacing.xs },
  errorCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.error,
    marginBottom: spacing.xs,
  },
  errorMessage: { fontSize: 14, color: colors.text, lineHeight: 20 },
});
