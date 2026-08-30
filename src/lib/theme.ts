// The single source of colour and spacing for the app. Nothing else defines a
// hex value or a magic pixel number.
//
// Groove is dark, full stop — there is no light palette and no runtime switch,
// so `colors` is a plain object rather than something resolved through a
// provider. That means a component can import it directly and its styles can go
// straight into `StyleSheet.create`, which is both simpler and cheaper than
// rebuilding style objects on every render.
//
// Two layers: a named raw palette, then semantic tokens pointing at it, so a
// token's meaning and its actual colour are both visible in one place. Swap
// `accent` and the app rebrands.
//
// Every pair is measured, not eyeballed — `tests/lib/theme.test.ts` asserts the
// WCAG AA ratios and fails the verify loop on a regression.

// 1. Raw palette. Not exported: components reference semantic tokens only.
const ash = {
  975: '#080808',
  950: '#101011',
  900: '#1a1a1c',
  800: '#2e2e32',
  700: '#68686c',
  400: '#9b9ba3',
  50: '#ededf0',
} as const;

const hue = {
  azure: '#7aa7ff',
  sage: '#5bd88a',
  rose: '#f98a8a',
  gold: '#f5c14b',
} as const;

// 2. Semantic tokens.
export interface Colors {
  /** Screen background. */
  bg: string;
  /** Recessed surfaces — inputs, grouped list backgrounds. */
  bgAlt: string;
  /** Raised surfaces — cards, sheets. */
  surface: string;
  /** Primary text. */
  fg: string;
  /** Secondary text. Still meets AA against every background above. */
  muted: string;
  /** Decorative dividers. Deliberately subtle; below the 3:1 UI-boundary bar. */
  border: string;
  /** Control boundaries and focus indicators. Meets 3:1 (WCAG 1.4.11). */
  borderStrong: string;
  accent: string;
  /** Text and icons drawn ON the accent fill — light accent, dark label. */
  onAccent: string;
  /** A habit met its target. */
  success: string;
  /** A destructive action, or a field that failed validation. */
  error: string;
  /** A habit below its target but not yet failing. */
  warning: string;
}

export const colors: Colors = {
  bg: ash[950],
  bgAlt: ash[975],
  surface: ash[900],
  fg: ash[50],
  muted: ash[400],
  border: ash[800],
  borderStrong: ash[700],
  accent: hue.azure,
  onAccent: ash[950],
  success: hue.sage,
  error: hue.rose,
  warning: hue.gold,
};

/** 4pt grid. Use these rather than raw numbers so rhythm stays consistent. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
} as const;

export const fontSize = {
  sm: 13,
  body: 16,
  lg: 20,
  title: 28,
} as const;

/**
 * Minimum size for anything tappable, in dp.
 *
 * Android's Material guideline is 48dp (iOS asks 44pt); we take the larger so
 * one number works on both. Enforced by `Button` and every icon-only control —
 * a 24dp icon with no padding is the most common accessibility failure in a
 * mobile app, and it is invisible until someone with larger hands or a tremor
 * tries to use it.
 */
export const MIN_TOUCH_TARGET = 48;
