// The single source of colour and spacing for the app. Nothing else defines a
// hex value or a magic pixel number.
//
// Same two-layer shape as the web template: a named raw palette, then semantic
// tokens pointing at it, so a token's meaning and its actual colour are both
// visible in one place. Swap `accent` and the app rebrands.
//
// Every pair is measured, not eyeballed — `tests/lib/theme.test.ts` asserts the
// WCAG AA ratios and fails the verify loop on a regression. Change a colour and
// the tests tell you whether it is legible.

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

const paper = {
  0: '#ffffff',
  50: '#f7f7f8',
  100: '#eeeef0',
  200: '#dcdce0',
  // Measured against bgAlt (#eeeef0), not just the page: an input's border sits
  // on the recessed background, which is the tightest of the three and the only
  // one that actually fails. #8a8a94 clears 3:1 on bg and surface but lands at
  // 2.95 here.
  400: '#84848e',
  600: '#5f5f68',
  950: '#17171a',
} as const;

const hue = {
  azure: '#7aa7ff',
  cobalt: '#2159d4',
  sage: '#5bd88a',
  forest: '#146138',
  rose: '#f98a8a',
  brick: '#a81f1f',
  gold: '#f5c14b',
  bronze: '#7a5000',
} as const;

// 2. Semantic tokens.
export interface ThemeColors {
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
  /** Text/icons drawn ON the accent colour. Not always the background colour. */
  onAccent: string;
  success: string;
  error: string;
  warning: string;
}

export const themes: Record<'light' | 'dark', ThemeColors> = {
  dark: {
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
  },
  light: {
    bg: paper[50],
    bgAlt: paper[100],
    surface: paper[0],
    fg: paper[950],
    muted: paper[600],
    border: paper[200],
    borderStrong: paper[400],
    accent: hue.cobalt,
    onAccent: paper[50],
    success: hue.forest,
    error: hue.brick,
    warning: hue.bronze,
  },
};

export type ThemeName = keyof typeof themes;

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
