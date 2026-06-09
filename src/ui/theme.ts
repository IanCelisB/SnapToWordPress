// src/ui/theme.ts — NativeWind / RN StyleSheet theme tokens.
// WU-5 (task 5.12) finalizes the calm palette; this is the WU-1 seed.

export const colors = {
  bg: '#FAFAF7',
  surface: '#FFFFFF',
  text: '#1F1F1F',
  muted: '#6B6B6B',
  line: '#E5E5E0',
  accent: '#3B5BDB',
  warning: '#B45309',
  error: '#9F1239',
  ok: '#15803D',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
} as const;
