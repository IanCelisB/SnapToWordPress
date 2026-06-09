// src/ui/components/StatusPill.tsx — a calm, plain-Spanish status
// indicator (review-queue spec R2 + Design §2 Decision §9).
//
// Per the design decision, this component owns its own state→label
// map. The wording is NOT in the error catalog because status pills
// are happy-path labels, not recoverable failures. Adding a new
// state here is a UI change, not a catalog change.

import { StyleSheet, Text, View } from 'react-native';
import type { ProductStatus } from '../../domain/types';
import { Strings } from '../strings';
import { colors, radius, spacing } from '../theme';

export type StatusPillProps = {
  status: ProductStatus;
  /** Optional: whether the product has a confirmed price. */
  priceConfirmed?: boolean;
  testID?: string;
};

export function StatusPill({
  status,
  priceConfirmed,
  testID,
}: StatusPillProps): React.ReactElement {
  const label = labelFor(status, priceConfirmed === false);
  const palette = paletteFor(status);
  return (
    <View
      style={[styles.pill, { backgroundColor: palette.bg }]}
      testID={testID ?? `status-pill.${status}`}
    >
      <Text style={[styles.text, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

function labelFor(status: ProductStatus, priceUnconfirmed: boolean): string {
  if (status === 'pending' && priceUnconfirmed) {
    return Strings.pillPending;
  }
  switch (status) {
    case 'pending':
      return Strings.pillPending;
    case 'ready':
      return Strings.pillReady;
    case 'syncing':
      return Strings.pillSyncing;
    case 'synced':
      return Strings.pillSynced;
    case 'failed':
      return Strings.pillFailed;
    case 'needs-attention':
      return Strings.pillNeedsAttention;
    default: {
      // Exhaustiveness guard: a never-typed `status` here would
      // surface as a compile error when a new variant is added.
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

function paletteFor(status: ProductStatus): { bg: string; fg: string } {
  switch (status) {
    case 'pending':
      return { bg: '#FEF3C7', fg: '#92400E' };
    case 'ready':
      return { bg: '#DBEAFE', fg: '#1E3A8A' };
    case 'syncing':
      return { bg: '#E0E7FF', fg: '#3730A3' };
    case 'synced':
      return { bg: '#DCFCE7', fg: '#166534' };
    case 'failed':
    case 'needs-attention':
      return { bg: '#FEE2E2', fg: '#991B1B' };
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 12, fontWeight: 'bold' },
});

