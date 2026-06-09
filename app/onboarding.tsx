// app/onboarding.tsx — first-launch store-config flow.
//
// Renders URL + Key + Secret fields, normalizes the URL in-memory,
// shows the http→https confirmation prompt and the trailing-path hint
// as in-form UX prompts (NOT catalog entries — see Design §2 Decision
// §2), and on "Conectar tienda" calls `validateAndSave`. The card
// that surfaces a 401 / network / 404 error comes from the catalog
// via `presentError`.
//
// No inline Spanish strings for errors: every error message comes
// from the error-presentation catalog.

import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import { validateAndSave } from '@/services/credentials';
import { canonicalizeBaseUrl } from '@/services/woocommerce/client';
import { colors, radius, spacing } from '@/ui/theme';

type FieldKey = 'url' | 'key' | 'secret';

type FormState = Record<FieldKey, string>;

type ConfirmPrompt = { kind: 'https'; suggested: string } | null;

export default function Onboarding(): React.ReactElement {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({ url: '', key: '', secret: '' });
  const [confirmPrompt, setConfirmPrompt] = useState<ConfirmPrompt>(null);
  const [error, setError] = useState<CatalogEntry | null>(null);
  const [busy, setBusy] = useState(false);

  const normalizedPreview = useMemo(
    () => (form.url.trim().length > 0 ? safeNormalize(form.url) : null),
    [form.url],
  );

  const pathWasStripped = useMemo(() => {
    if (!form.url.trim()) return false;
    try {
      const parsed = new URL(safeNormalize(form.url));
      return parsed.pathname.length > 1;
    } catch {
      return false;
    }
  }, [form.url]);

  const setField = useCallback((key: FieldKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setError(null);
  }, []);

  const handleConnect = useCallback(async () => {
    setError(null);
    const url = form.url.trim();
    if (!url) {
      setError(presentError('datos-invalidos', { field: 'url', reason: 'required' }));
      return;
    }
    if (!form.key.trim() || !form.secret.trim()) {
      setError(
        presentError('datos-invalidos', { field: 'credenciales', reason: 'required' }),
      );
      return;
    }
    // UX prompt: http→https confirmation. UX prompt: trailing path strip.
    if (/^http:\/\//i.test(url) && confirmPrompt === null) {
      setConfirmPrompt({
        kind: 'https',
        suggested: `https://${url.replace(/^https?:\/\//i, '')}`,
      });
      return;
    }
    setBusy(true);
    try {
      const result = await validateAndSave({
        baseUrl: url,
        key: form.key.trim(),
        secret: form.secret.trim(),
      });
      if (result.ok) {
        // The first-launch routing will re-mount the (tabs) layer.
        router.replace('/');
        return;
      }
      setError(presentError(result.classification));
    } catch (err) {
      setError(presentError(err));
    } finally {
      setBusy(false);
    }
  }, [form, confirmPrompt, router]);

  const acceptHttpsPrompt = useCallback(() => {
    if (confirmPrompt?.kind === 'https') {
      setForm((prev) => ({ ...prev, url: confirmPrompt.suggested }));
    }
    setConfirmPrompt(null);
  }, [confirmPrompt]);

  const dismissHttpsPrompt = useCallback(() => {
    setConfirmPrompt(null);
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>Conectá tu tienda</Text>
          <Text style={styles.subtitle}>
            Pegá la URL de tu tienda WooCommerce y tus claves de acceso.
            Las guardamos en el teléfono, no en la nube.
          </Text>

          <Field
            label="URL de la tienda"
            placeholder="https://mitienda.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={form.url}
            onChangeText={(v) => setField('url', v)}
            testID="onboarding.url"
          />
          {normalizedPreview ? (
            <Text style={styles.hint}>
              Vamos a usar: {normalizedPreview}
            </Text>
          ) : null}
          {pathWasStripped ? (
            <Text style={styles.hint}>
              Quitamos la ruta y usamos solo el dominio.
            </Text>
          ) : null}

          <Field
            label="Consumer Key"
            placeholder="ck_xxxxxxxxxxxxxxxxxxxx"
            autoCapitalize="none"
            autoCorrect={false}
            value={form.key}
            onChangeText={(v) => setField('key', v)}
            testID="onboarding.key"
            secureTextEntry
          />
          <Field
            label="Consumer Secret"
            placeholder="cs_xxxxxxxxxxxxxxxxxxxx"
            autoCapitalize="none"
            autoCorrect={false}
            value={form.secret}
            onChangeText={(v) => setField('secret', v)}
            testID="onboarding.secret"
            secureTextEntry
          />

          {error ? (
            <ErrorCard entry={error} />
          ) : null}

          {confirmPrompt?.kind === 'https' ? (
            <View style={styles.prompt}>
              <Text style={styles.promptText}>
                La URL tiene que empezar con https. ¿Querés usar {confirmPrompt.suggested}?
              </Text>
              <View style={styles.promptRow}>
                <Pressable
                  onPress={dismissHttpsPrompt}
                  style={[styles.promptButton, styles.promptSecondary]}
                  testID="onboarding.https.no"
                >
                  <Text style={styles.promptSecondaryText}>No, la cambio</Text>
                </Pressable>
                <Pressable
                  onPress={acceptHttpsPrompt}
                  style={[styles.promptButton, styles.promptPrimary]}
                  testID="onboarding.https.yes"
                >
                  <Text style={styles.promptPrimaryText}>Sí, usar https</Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          <Pressable
            onPress={handleConnect}
            disabled={busy}
            style={[styles.primary, busy && styles.primaryDisabled]}
            testID="onboarding.connect"
          >
            {busy ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.primaryText}>Conectar tienda</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type FieldProps = {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  keyboardType?: 'default' | 'url' | 'email-address';
  secureTextEntry?: boolean;
  testID?: string;
};

function Field({
  label,
  placeholder,
  value,
  onChangeText,
  autoCapitalize = 'none',
  autoCorrect = false,
  keyboardType = 'default',
  secureTextEntry = false,
  testID,
}: FieldProps): React.ReactElement {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        testID={testID}
      />
    </View>
  );
}

function ErrorCard({ entry }: { entry: CatalogEntry }): React.ReactElement {
  return (
    <View style={styles.errorCard} testID="onboarding.error">
      <Text style={styles.errorTitle}>{entry.title}</Text>
      <Text style={styles.errorMessage}>{entry.message}</Text>
    </View>
  );
}

function safeNormalize(input: string): string {
  try {
    return canonicalizeBaseUrl(input);
  } catch {
    return input;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  scroll: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  title: {
    fontSize: 26,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 15,
    color: colors.muted,
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  field: { marginBottom: spacing.lg },
  label: {
    fontSize: 14,
    color: colors.muted,
    marginBottom: spacing.xs,
  },
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
  hint: {
    marginTop: -spacing.sm,
    marginBottom: spacing.md,
    color: colors.muted,
    fontSize: 13,
  },
  errorCard: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.error,
    marginBottom: spacing.xs,
  },
  errorMessage: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  prompt: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  promptText: { fontSize: 14, color: colors.text, marginBottom: spacing.md },
  promptRow: { flexDirection: 'row', gap: spacing.sm },
  promptButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  promptPrimary: { backgroundColor: colors.accent },
  promptPrimaryText: { color: colors.surface, fontWeight: '600' },
  promptSecondary: { backgroundColor: colors.bg, borderColor: colors.line, borderWidth: 1 },
  promptSecondaryText: { color: colors.text },
  primary: {
    backgroundColor: colors.accent,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  primaryDisabled: { opacity: 0.6 },
  primaryText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
});
