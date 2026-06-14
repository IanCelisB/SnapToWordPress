// src/ui/theme.ts — design tokens for the EtiquetadorDeProductos app.
//
// Inspired by Material Design 3 + iOS HIG, but adapted for a
// professional work tool (not playful, not gamified). The palette is
// warm-neutral with a single trustworthy blue accent; elevation is
// subtle; spacing follows a 4 px scale; typography has a clear
// hierarchy from h1 down to micro caption.
//
// Tokens are grouped by concern (color, spacing, radius, typography,
// elevation). Components import the group they need; no string hex
// codes are inlined in TSX.

export const colors = {
  // ── Backgrounds ─────────────────────────────────────────────
  // Page background is a warm off-white, not pure white, to reduce
  // eye strain on long sessions. Surfaces (cards) are pure white
  // to lift them off the page.
  bg: '#FAFAF7',
  surface: '#FFFFFF',
  surfaceMuted: '#F4F4F0',
  surfacePressed: '#EFEEE8',

  // ── Text ───────────────────────────────────────────────────
  // Primary text is a rich near-black, not pure #000, for the same
  // reason. Muted is mid-gray for secondary info (counts, hints).
  text: '#1A1A1A',
  textMuted: '#6B6B6B',
  // Legacy alias: a few screens still reference `colors.muted` from
  // before the v2 palette. Keep it pointing at `textMuted` so they
  // keep working. New code should prefer the explicit name.
  muted: '#6B6B6B',
  textDisabled: '#A0A09A',
  textInverse: '#FFFFFF',

  // ── Borders ────────────────────────────────────────────────
  // Subtle on-page, slightly stronger for emphasized edges.
  line: '#E5E5E0',
  lineStrong: '#C7C7C0',

  // ── Accent (primary action) ────────────────────────────────
  // Warm orange (Tailwind orange-500/600 family). The user rejected
  // the previous blue for feeling too "consumerish" — orange reads
  // as a more serious work-tool accent while still having visual
  // identity. Hover / pressed variants come from the same hue
  // family. Use `accent` for buttons / links; `accentSoft` for
  // subtle backgrounds (badges, selected states).
  accent: '#EA580C',
  accentHover: '#C2410C',
  accentSoft: '#FFEDD5',
  accentText: '#FFFFFF',

  // ── Semantic ───────────────────────────────────────────────
  // Each semantic color has a strong (`*`) and soft (`*Soft`)
  // variant. Use strong for text/icons; use soft for backgrounds.
  success: '#15803D',
  successSoft: '#DCFCE7',
  // Legacy alias: a few components still reference `colors.ok`
  // from before the v2 palette. Keep it pointing at `success`
  // so they keep working. New code should prefer the explicit
  // name.
  ok: '#15803D',
  warning: '#B45309',
  warningSoft: '#FEF3C7',
  error: '#9F1239',
  errorSoft: '#FEE2E2',
  info: '#1E40AF',
  infoSoft: '#DBEAFE',
} as const;

export const spacing = {
  // 4 px base scale. Use these instead of arbitrary numbers so
  // spacing is consistent across screens.
  xs: 4,    // tight: chip padding, small gaps inside rows
  sm: 8,    // small: list item gap, button padding-y
  md: 12,   // medium: card padding, section gap
  lg: 16,   // large: page padding, large button padding
  xl: 24,   // extra-large: section gap
  xxl: 32,  // huge: header bottom margin
  xxxl: 48, // massive: page top padding
} as const;

export const radius = {
  // Subtle by default; use `full` for pills/avatars only.
  sm: 6,
  md: 10,
  lg: 16,
  full: 9999,
} as const;

export const typography = {
  // h1 / h2 are for screen titles. h3 is for section headers
  // inside a screen. body is default text; bodyEmphasis is for
  // important body content (names, prices). caption is for
  // secondary info (hints, metadata). micro is for status pills
  // and very small labels.
  h1: { fontSize: 32, fontWeight: '700' as const, lineHeight: 40, letterSpacing: -0.5 },
  h2: { fontSize: 24, fontWeight: '700' as const, lineHeight: 32, letterSpacing: -0.3 },
  h3: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodyEmphasis: { fontSize: 16, fontWeight: '600' as const, lineHeight: 24 },
  caption: { fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  captionEmphasis: { fontSize: 13, fontWeight: '600' as const, lineHeight: 18 },
  micro: { fontSize: 11, fontWeight: '600' as const, lineHeight: 14, letterSpacing: 0.4 },
} as const;

export const elevation = {
  // Material-style elevation. `shadow*` props are iOS; `elevation`
  // is Android. Both are set so the same token works on both
  // platforms. Keep shadowOpacity low for a calm, professional
  // feel — no dramatic drop shadows.
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sm: {
    // Subtle lift for cards / list items
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    // For floating elements (FAB, modal sheets, sticky headers)
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  lg: {
    // For overlays and popovers
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;

export type Colors = typeof colors;
export type Spacing = typeof spacing;
export type Radius = typeof radius;
export type Typography = typeof typography;
export type Elevation = typeof elevation;
