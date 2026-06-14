// src/ui/primitives.tsx — design-system building blocks.
//
// Every screen consumes these instead of inlining styles. They map
// 1:1 to the theme tokens in `./theme` so a future theme change
// propagates to every component without touching screens.
//
// Conventions:
//   - Props are minimal: variant, size, disabled, onPress, children.
//   - No business logic. These are pure presentational.
//   - Pressable is used for buttons (gives a real press state on
//     both iOS and Android). TouchableOpacity is avoided because it
//     doesn't give haptic / opacity feedback on web.

import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import {
  colors,
  elevation,
  radius,
  spacing,
  typography,
} from './theme';

// ─── Button ────────────────────────────────────────────────────
// Four variants (primary / secondary / danger / ghost) and three
// sizes (sm / md / lg). The "loading" prop swaps the label for a
// spinner and disables the button. Use Pressable so the surface
// dims on press.

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
  fullWidth?: boolean;
  style?: ViewStyle;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  testID,
  fullWidth = false,
  style,
}: ButtonProps): React.ReactElement {
  const palette = paletteFor(variant);
  const sizing = sizeFor(size);
  const isInactive = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isInactive}
      testID={testID}
      style={({ pressed }) => [
        styles.buttonBase,
        sizing.container,
        { backgroundColor: pressed && !isInactive ? palette.pressed : palette.bg },
        { borderColor: palette.border },
        isInactive && styles.buttonDisabled,
        fullWidth && styles.buttonFullWidth,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            sizing.label,
            { color: palette.fg },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function paletteFor(variant: ButtonVariant) {
  switch (variant) {
    case 'primary':
      return { bg: colors.accent, pressed: colors.accentHover, border: colors.accent, fg: colors.accentText };
    case 'secondary':
      return { bg: colors.surface, pressed: colors.surfaceMuted, border: colors.line, fg: colors.text };
    case 'danger':
      return { bg: colors.error, pressed: '#7F0E2E', border: colors.error, fg: colors.textInverse };
    case 'ghost':
      return { bg: 'transparent', pressed: colors.surfaceMuted, border: 'transparent', fg: colors.accent };
  }
}

function sizeFor(size: ButtonSize) {
  switch (size) {
    case 'sm':
      return { container: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md } as ViewStyle,
               label: { fontSize: 14, fontWeight: '600' as const } };
    case 'md':
      return { container: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg } as ViewStyle,
               label: { fontSize: 15, fontWeight: '600' as const } };
    case 'lg':
      return { container: { paddingVertical: spacing.md + 2, paddingHorizontal: spacing.lg } as ViewStyle,
               label: { fontSize: 16, fontWeight: '600' as const } };
  }
}

// ─── Card ──────────────────────────────────────────────────────
// A surface with a border and subtle elevation. Use as the
// container for list items, settings sections, etc.

export type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  elevated?: boolean;
  padding?: keyof typeof spacing | 'none';
  testID?: string;
  style?: ViewStyle;
};

export function Card({
  children,
  onPress,
  elevated = false,
  padding = 'lg',
  testID,
  style,
}: CardProps): React.ReactElement {
  const content = (
    <View
      style={[
        styles.cardBase,
        padding !== 'none' && { padding: spacing[padding] },
        elevated ? elevation.sm : null,
        style,
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressed && { backgroundColor: colors.surfacePressed }]}
    >
      {content}
    </Pressable>
  );
}

// ─── Input ─────────────────────────────────────────────────────
// A labeled text input with consistent spacing. The label sits
// above the field; the optional helper sits below. Errors are
// surfaced as red text below the field, with the field border
// turning red too.

export type InputProps = Omit<TextInputProps, 'style'> & {
  label: string;
  helperText?: string;
  errorText?: string;
  containerStyle?: ViewStyle;
};

export function Input({
  label,
  helperText,
  errorText,
  containerStyle,
  multiline,
  ...textInputProps
}: InputProps): React.ReactElement {
  const hasError = Boolean(errorText);
  return (
    <View style={[{ marginBottom: spacing.md }, containerStyle]}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        {...textInputProps}
        multiline={multiline}
        placeholderTextColor={colors.textDisabled}
        style={[
          styles.inputBase,
          multiline && styles.inputMultiline,
          hasError && { borderColor: colors.error },
        ]}
      />
      {errorText ? (
        <Text style={styles.inputErrorText}>{errorText}</Text>
      ) : helperText ? (
        <Text style={styles.inputHelperText}>{helperText}</Text>
      ) : null}
    </View>
  );
}

// ─── Header ────────────────────────────────────────────────────
// Standard screen header: h1 title + optional subtitle + optional
// right-side action. The `compact` variant uses h2 instead of h1
// for in-tab screens where the bottom tab bar already provides
// context.

export type HeaderProps = {
  title: string;
  subtitle?: string;
  compact?: boolean;
  rightAction?: ReactNode;
  testID?: string;
};

export function Header({
  title,
  subtitle,
  compact = false,
  rightAction,
  testID,
}: HeaderProps): React.ReactElement {
  return (
    <View style={styles.headerRow} testID={testID}>
      <View style={styles.headerText}>
        <Text style={compact ? typography.h2 : typography.h1}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {rightAction ? <View>{rightAction}</View> : null}
    </View>
  );
}

// ─── Section ───────────────────────────────────────────────────
// Used in settings and other long-scroll screens to group related
// fields with a small uppercase label.

export type SectionProps = {
  title: string;
  children: ReactNode;
  testID?: string;
};

export function Section({ title, children, testID }: SectionProps): React.ReactElement {
  return (
    <View style={styles.section} testID={testID}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      <Card padding="lg" elevated={false}>{children}</Card>
    </View>
  );
}

// ─── EmptyState ────────────────────────────────────────────────
// Centered icon (emoji or short text) + title + hint. Used when a
// list is empty so the user knows what to do next.

export type EmptyStateProps = {
  icon?: string;
  title: string;
  hint?: string;
  testID?: string;
};

export function EmptyState({ icon, title, hint, testID }: EmptyStateProps): React.ReactElement {
  return (
    <View style={styles.emptyState} testID={testID}>
      {icon ? <Text style={styles.emptyIcon}>{icon}</Text> : null}
      <Text style={typography.bodyEmphasis}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

// ─── ErrorCard ─────────────────────────────────────────────────
// Inline error block: red soft background, red title, muted message.
// Use inside a screen body to surface validation / network errors.

export type ErrorCardProps = {
  title: string;
  message: string;
  testID?: string;
};

export function ErrorCard({ title, message, testID }: ErrorCardProps): React.ReactElement {
  return (
    <View style={styles.errorCard} testID={testID}>
      <Text style={styles.errorCardTitle}>{title}</Text>
      <Text style={styles.errorCardMessage}>{message}</Text>
    </View>
  );
}

// ─── FieldRow ──────────────────────────────────────────────────
// A simple key/value row inside a Card. Used in the per-product
// detail and settings to render "Precio: $1500" style rows.

export type FieldRowProps = {
  label: string;
  value: string;
  testID?: string;
};

export function FieldRow({ label, value, testID }: FieldRowProps): React.ReactElement {
  return (
    <View style={styles.fieldRow} testID={testID}>
      <Text style={styles.fieldRowLabel}>{label}</Text>
      <Text style={styles.fieldRowValue}>{value}</Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Button
  buttonBase: {
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonFullWidth: {
    alignSelf: 'stretch',
  },
  buttonLabel: {
    textAlign: 'center',
  },

  // Card
  cardBase: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.lg,
  },

  // Input
  inputLabel: {
    ...typography.captionEmphasis,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  inputBase: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.text,
    ...typography.body,
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  inputHelperText: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  inputErrorText: {
    ...typography.caption,
    color: colors.error,
    marginTop: spacing.xs,
  },

  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  headerText: {
    flex: 1,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },

  // Section
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    ...typography.micro,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },

  // EmptyState
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyHint: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },

  // ErrorCard
  errorCard: {
    backgroundColor: colors.errorSoft,
    borderColor: colors.error,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  errorCardTitle: {
    ...typography.bodyEmphasis,
    color: colors.error,
    marginBottom: spacing.xs,
  },
  errorCardMessage: {
    ...typography.caption,
    color: colors.text,
    lineHeight: 20,
  },

  // FieldRow
  fieldRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  fieldRowLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  fieldRowValue: {
    ...typography.bodyEmphasis,
    color: colors.text,
  },
});
