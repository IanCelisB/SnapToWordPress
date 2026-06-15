// app/(tabs)/settings.tsx — store-config settings + sign out.
//
// Per Design §11 the screen has two shapes:
//
//   1. NO credentials configured (first-time user or after sign-out):
//      - "Tienda actual" section (URL placeholder + reconnect hidden)
//      - "Configurar tienda" section with the inline form
//        (URL + Consumer Key + Consumer Secret + Guardar)
//      - "Almacenamiento" section
//      - No "Cerrar sesión" section (nothing to sign out from)
//
//   2. Credentials configured (the user is "online"):
//      - "Tienda actual" section with the current URL, an "Conectado"
//        badge, and a "Reconectar tienda" button
//      - "Almacenamiento" section
//      - "Cerrar sesión" section (clears the secure store, keeps the
//        local DB so the user can re-link the same store without
//        losing pending products)
//
// The inline form is the ONLY path to configure credentials. There
// is no separate onboarding / login screen — the user lands on the
// home menu and the form is here when they need it.
//
// After a successful save we render a calm "Credenciales guardadas"
// banner; after a successful re-validate we render a "Tienda
// reconectada" banner. Both auto-dismiss after a few seconds.

import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { presentError, type CatalogEntry } from '@/error-presentation';
import {
  clearCredentials,
  loadCredentials,
  revalidate,
  validateAndSave,
} from '@/services/credentials';
import { getDirSize, type DirSize } from '@/infra/file-system';
import { Button, FieldRow, Header, Input, Section } from '@/ui/primitives';
import { colors, radius, spacing, typography } from '@/ui/theme';
import { Strings } from '@/ui/strings';

type Mode = 'idle' | 'reconnecting' | 'saving' | 'signing-out';

// Auto-dismiss delay for the success banners.
const BANNER_DISMISS_MS = 3_000;

export default function Settings(): React.ReactElement {
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const [hasCreds, setHasCreds] = useState(false);
  const [dirSize, setDirSize] = useState<DirSize | null>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const [error, setError] = useState<CatalogEntry | null>(null);
  // Two distinct success states — a save and a revalidate are not
  // the same action, so they get their own copy + auto-dismiss
  // timer.
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [revalidatedAt, setRevalidatedAt] = useState<number | null>(null);

  // Configure form (pre-filled with the current creds if any).
  const [formUrl, setFormUrl] = useState('');
  const [formKey, setFormKey] = useState('');
  const [formSecret, setFormSecret] = useState('');
  const [formError, setFormError] = useState<string | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        const creds = await loadCredentials();
        setHasCreds(creds !== null);
        setStoreUrl(creds?.baseUrl ?? null);
        setFormUrl(creds?.baseUrl ?? '');
        setFormKey(creds?.key ?? '');
        setFormSecret('');
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

  // Auto-dismiss the success banners after a few seconds. We use a
  // single timer driven by whichever banner fired last so a fresh
  // success resets the countdown.
  useEffect(() => {
    if (savedAt === null && revalidatedAt === null) return;
    const timer = setTimeout(() => {
      setSavedAt(null);
      setRevalidatedAt(null);
    }, BANNER_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [savedAt, revalidatedAt]);

  const handleReconnect = useCallback(async () => {
    setError(null);
    setMode('reconnecting');
    try {
      const result = await revalidate();
      if (!result.ok) {
        setError(presentError(result.classification));
      } else {
        setStoreUrl(result.normalizedUrl);
        setRevalidatedAt(Date.now());
      }
    } catch (err) {
      setError(presentError(err));
    } finally {
      setMode('idle');
    }
  }, []);

  const handleSave = useCallback(async () => {
    setError(null);
    setFormError(undefined);
    if (!formUrl.trim() || !formKey.trim() || !formSecret.trim()) {
      setFormError(Strings.settingsFieldRequired);
      return;
    }
    setMode('saving');
    try {
      // `validateAndSave` persists BEFORE validating now (see
      // src/services/credentials.ts). So regardless of validation
      // outcome, the credentials are saved and the UI can reflect
      // that. If validation fails we surface the error as a
      // non-blocking notice — the user can still sync / test later.
      const result = await validateAndSave({
        baseUrl: formUrl,
        key: formKey,
        secret: formSecret,
      });
      setStoreUrl(result.normalizedUrl);
      setHasCreds(true);
      // Clear the secret field for safety; keep the URL+key
      // pre-filled so the user can see what they configured and
      // quickly re-edit if needed.
      setFormUrl(result.normalizedUrl);
      setFormSecret('');
      setSavedAt(Date.now());
      if (!result.ok) {
        setError(presentError(result.classification));
      }
    } catch (err) {
      setError(presentError(err));
    } finally {
      setMode('idle');
    }
  }, [formUrl, formKey, formSecret]);

  const handleSignOut = useCallback(async () => {
    setError(null);
    setMode('signing-out');
    try {
      await clearCredentials();
      setHasCreds(false);
      setStoreUrl(null);
      setFormUrl('');
      setFormKey('');
      setFormSecret('');
      setSavedAt(null);
      setRevalidatedAt(null);
    } finally {
      setMode('idle');
    }
  }, []);

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Header title={Strings.settingsTitle} compact />

        {/* Tienda actual — always visible so the user always knows
            whether the app is connected to a store. */}
        <Section title={Strings.settingsStore} testID="settings.section.store">
          <FieldRow
            label={Strings.settingsUrlLabel}
            value={storeUrl ?? '—'}
            testID="settings.url"
          />
          {hasCreds ? (
            <View style={styles.badgeRow}>
              <View style={styles.badge} testID="settings.onlineBadge">
                <Text style={styles.badgeText}>{Strings.settingsConnected}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.muted}>{Strings.settingsNotConnectedHint}</Text>
          )}
          {hasCreds ? (
            <Button
              label={Strings.settingsReconnect}
              onPress={handleReconnect}
              loading={mode === 'reconnecting'}
              disabled={mode !== 'idle'}
              variant="secondary"
              fullWidth
              testID="settings.reconnect"
              style={styles.reconnect}
            />
          ) : null}
        </Section>

        {/* Configure-store form — only shown when no creds are
            configured. When the user is "online" the form is hidden
            so they don't see (and re-save) the same credentials by
            mistake. To re-link a different store, they sign out
            first. */}
        {!hasCreds ? (
          <Section
            title={Strings.settingsConfigure}
            testID="settings.section.configure"
          >
            <Input
              label={Strings.settingsUrlLabel}
              value={formUrl}
              onChangeText={setFormUrl}
              placeholder={Strings.settingsUrlPlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              testID="settings.configure.url"
            />
            <Input
              label={Strings.settingsKeyLabel}
              value={formKey}
              onChangeText={setFormKey}
              placeholder={Strings.settingsKeyPlaceholder}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              testID="settings.configure.key"
            />
            <Input
              label={Strings.settingsSecretLabel}
              value={formSecret}
              onChangeText={setFormSecret}
              placeholder={Strings.settingsSecretPlaceholder}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              testID="settings.configure.secret"
              errorText={formError}
            />
            <Button
              label={Strings.settingsSave}
              onPress={handleSave}
              loading={mode === 'saving'}
              disabled={mode !== 'idle'}
              variant="primary"
              fullWidth
              testID="settings.configure.submit"
              style={styles.submit}
            />
          </Section>
        ) : null}

        {/* Almacenamiento */}
        <Section title={Strings.settingsStorage} testID="settings.section.storage">
          <Text style={styles.muted}>
            {dirSize
              ? Strings.settingsStorageUsedTpl.replace(
                  '{mb}',
                  String(dirSize.megabytes),
                )
              : Strings.settingsStorageCalculating}
          </Text>
          <Text style={styles.mutedSmall}>{Strings.settingsStorageHint}</Text>
        </Section>

        {/* Cerrar sesión — only when there's something to sign out
            from. Clearing creds on a fresh install would just put the
            user in the same state, no point offering the action. */}
        {hasCreds ? (
          <Section title={Strings.settingsSignOut} testID="settings.section.signout">
            <Text style={styles.muted}>{Strings.settingsSignOutHint}</Text>
            <Button
              label={Strings.settingsSignOut}
              onPress={handleSignOut}
              loading={mode === 'signing-out'}
              disabled={mode !== 'idle'}
              variant="danger"
              fullWidth
              testID="settings.signout"
              style={styles.signout}
            />
          </Section>
        ) : null}

        {/* Calm success banners. Each auto-dismisses after a few
            seconds (see the BANNER_DISMISS_MS effect above). They
            are mutually exclusive: a save clears revalidated, and
            a reconnect clears saved. */}
        {savedAt !== null && error === null ? (
          <View style={styles.successCard} testID="settings.savedBanner">
            <Text style={styles.successTitle}>{Strings.settingsSavedTitle}</Text>
            <Text style={styles.successHint}>{Strings.settingsSavedHintLinked}</Text>
          </View>
        ) : null}
        {revalidatedAt !== null && error === null ? (
          <View style={styles.successCard} testID="settings.reconnectedBanner">
            <Text style={styles.successTitle}>
              {Strings.settingsReconnectedTitle}
            </Text>
            <Text style={styles.successHint}>
              {Strings.settingsReconnectedHint}
            </Text>
          </View>
        ) : null}

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
  muted: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  mutedSmall: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: -spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  badge: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  badgeText: {
    ...typography.caption,
    color: colors.accent,
    fontWeight: '600',
  },
  reconnect: { marginTop: spacing.sm },
  submit: { marginTop: spacing.sm },
  signout: { marginTop: spacing.md },
  successCard: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  successTitle: {
    ...typography.bodyEmphasis,
    color: colors.accent,
    marginBottom: spacing.xs,
  },
  successHint: {
    ...typography.caption,
    color: colors.text,
    lineHeight: 20,
  },
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
