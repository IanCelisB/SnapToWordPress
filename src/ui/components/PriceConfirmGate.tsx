// src/ui/components/PriceConfirmGate.tsx — the price-gate component.
//
// This is the single most important anti-mistake feature in the app
// (review-queue spec R4). The component shows:
//   - the CURRENT price (large, color-coded by direction of change),
//   - the ORIGINAL captured price (smaller, muted, with a clear label),
//   - a primary "Confirmar precio" button when the price has been
//     edited and not yet confirmed,
//   - a calm "Precio confirmado" indicator + "Editar precio" button
//     once confirmed (so the user can re-open the gate).
//
// The component is intentionally presentation-only. It owns no state;
// the parent (the review screen) decides when the gate is "open" and
// calls `onConfirm(originalPrice, newPrice)` or `onEdit()`.
//
// All Spanish strings come from `src/ui/strings.ts` — no inline
// literals.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Strings } from '../strings';
import { colors, radius, spacing } from '../theme';

export type PriceConfirmGateProps = {
  /** The price captured at the time the product was first saved. */
  originalPrice: number;
  /** The current value in the form. */
  currentPrice: number;
  /** True when the user has tapped "Confirmar precio". */
  priceConfirmed: boolean;
  /** True when the user changed the price since last save. */
  priceEdited: boolean;
  onConfirm: () => void;
  onEdit: () => void;
};

export function PriceConfirmGate({
  originalPrice,
  currentPrice,
  priceConfirmed,
  priceEdited,
  onConfirm,
  onEdit,
}: PriceConfirmGateProps): React.ReactElement {
  const showGate = priceEdited && !priceConfirmed;
  const delta = currentPrice - originalPrice;
  const color = showGate
    ? delta > 0
      ? colors.error
      : delta < 0
        ? colors.ok
        : colors.text
    : priceConfirmed
      ? colors.ok
      : colors.text;

  return (
    <View style={styles.container} testID="price-gate">
      <Text style={styles.title}>{Strings.editPriceGateTitle}</Text>

      <View style={styles.priceRow}>
        <View style={styles.priceCol}>
          <Text style={styles.muted}>{Strings.editPriceGateOriginal}</Text>
          <Text style={styles.mutedPrice} testID="price-gate.original">
            {formatPrice(originalPrice)}
          </Text>
        </View>
        <View style={styles.priceCol}>
          <Text style={styles.muted}>{Strings.editPriceGateNew}</Text>
          <Text
            style={[styles.price, { color }]}
            testID="price-gate.current"
          >
            {formatPrice(currentPrice)}
          </Text>
        </View>
      </View>

      {showGate ? (
        <Pressable
          onPress={onConfirm}
          style={[styles.button, styles.buttonPrimary]}
          testID="price-gate.confirm"
        >
          <Text style={styles.buttonPrimaryText}>
            {Strings.editPriceGateConfirm}
          </Text>
        </Pressable>
      ) : priceConfirmed ? (
        <View style={styles.confirmedRow}>
          <Text style={styles.confirmedText} testID="price-gate.confirmed">
            {Strings.editPriceGateConfirmed}
          </Text>
          <Pressable
            onPress={onEdit}
            style={[styles.button, styles.buttonSecondary]}
            testID="price-gate.edit"
          >
            <Text style={styles.buttonSecondaryText}>
              {Strings.editPriceGateEdit}
            </Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.muted}>
          {Strings.editApproveDisabled}
        </Text>
      )}
    </View>
  );
}

function formatPrice(value: number): string {
  return `$${value.toLocaleString('es-AR')}`;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: spacing.md,
  },
  priceRow: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginBottom: spacing.lg,
  },
  priceCol: { flex: 1 },
  muted: {
    fontSize: 13,
    color: colors.muted,
    marginBottom: spacing.xs,
  },
  mutedPrice: {
    fontSize: 18,
    color: colors.muted,
  },
  price: {
    fontSize: 32,
    fontWeight: 'bold',
  },
  button: {
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  buttonPrimary: { backgroundColor: colors.accent },
  buttonPrimaryText: {
    color: colors.surface,
    fontWeight: 'bold',
    fontSize: 16,
  },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
  },
  buttonSecondaryText: { color: colors.text, fontWeight: 'bold' },
  confirmedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  confirmedText: {
    color: colors.ok,
    fontWeight: 'bold',
    fontSize: 15,
    flex: 1,
  },
});

