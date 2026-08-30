import type { BoxShadowValue } from 'react-native';

// The single source of colour, depth and spacing. Nothing else defines a hex
// value, a shadow or a magic pixel number.
//
// Groove is dark, full stop — there is no light palette and no runtime switch,
// so `colors` is a plain object rather than something resolved through a
// provider. A component imports it directly and its styles go straight into
// `StyleSheet.create`.
//
// The look is soft-UI: surfaces are the *same* colour as the page and are
// separated from it by light and dark shadows rather than by borders or fills.
// That only works because React Native 0.76+ supports CSS-style `boxShadow`
// with multiple shadows and per-shadow colour — Android's older `elevation`
// gives one uncontrollable dark shadow and cannot express this at all.
//
// Every text pair is measured, not eyeballed — `tests/lib/theme.test.ts` asserts
// the WCAG AA ratios and fails the verify loop on a regression. The shadows are
// deliberately *not* held to a contrast bar: they are decoration, and every
// control that needs a legible boundary gets `borderStrong` as well.

// 1. Raw palette. Not exported: components reference semantic tokens only.
//
// A warm-neutral charcoal rather than a blue-grey one, so the orange sits on it
// as a relative rather than a stranger.
const slate = {
  // The lift and shade that carve a raised surface out of the page.
  lift: '#3a3e46',
  shade: '#1b1d21',
  recess: '#24262a',
  page: '#2c2f35',
  border: '#40444c',
  borderStrong: '#7c8089',
  muted: '#9ea2ab',
  fg: '#eceef1',
} as const;

const hue = {
  // Bright enough to read as a highlight on charcoal, warm enough to feel like
  // a sunrise rather than a warning light.
  ember: '#ff8a3d',
  emberDim: '#c25a18',
  sage: '#5bd88a',
  rose: '#f98a8a',
  amber: '#f2c94c',
} as const;

// 2. Semantic tokens.
export interface Colors {
  /** Screen background — and the fill of every raised surface on it. */
  bg: string;
  /** Recessed fill: inputs, track backgrounds, anything pressed into the page. */
  bgAlt: string;
  /** Raised surfaces. Deliberately identical to `bg`; the shadow is the edge. */
  surface: string;
  /** Primary text. */
  fg: string;
  /** Secondary text. Still meets AA against every background above. */
  muted: string;
  /** Decorative hairlines — the pinstripe rules above a section, for instance. */
  border: string;
  /** Control boundaries and focus rings. Meets 3:1 (WCAG 1.4.11). */
  borderStrong: string;
  accent: string;
  /** A dimmer accent for fills that sit behind text. */
  accentDim: string;
  /** Text and icons drawn ON the accent fill. */
  onAccent: string;
  /** A habit met its target. */
  success: string;
  /** A destructive action, or a field that failed validation. */
  error: string;
  /** Behind pace, or a partly finished day. */
  warning: string;
}

export const colors: Colors = {
  bg: slate.page,
  bgAlt: slate.recess,
  surface: slate.page,
  fg: slate.fg,
  muted: slate.muted,
  border: slate.border,
  borderStrong: slate.borderStrong,
  accent: hue.ember,
  accentDim: hue.emberDim,
  onAccent: slate.shade,
  success: hue.sage,
  error: hue.rose,
  warning: hue.amber,
};

/**
 * Depth, as paired shadows.
 *
 * `raised` lights the top-left and shades the bottom-right, so a surface reads
 * as pressed *out* of the page. `sunken` is the same two shadows inverted and
 * inset, so it reads as pressed *in* — used for inputs, progress tracks, and
 * the moment a button is held down.
 *
 * Typed as `BoxShadowValue[]` rather than a CSS string so the numbers stay
 * numbers and a typo is a type error.
 */
export const depth: Record<'raised' | 'raisedSoft' | 'sunken' | 'sunkenDeep', BoxShadowValue[]> = {
  raised: [
    { offsetX: -5, offsetY: -5, blurRadius: 12, color: slate.lift },
    { offsetX: 5, offsetY: 5, blurRadius: 12, color: slate.shade },
  ],
  // For small controls, where a full-size shadow would swamp the element.
  raisedSoft: [
    { offsetX: -3, offsetY: -3, blurRadius: 7, color: slate.lift },
    { offsetX: 3, offsetY: 3, blurRadius: 7, color: slate.shade },
  ],
  sunken: [
    { offsetX: -3, offsetY: -3, blurRadius: 7, color: slate.lift, inset: true },
    { offsetX: 3, offsetY: 3, blurRadius: 7, color: slate.shade, inset: true },
  ],
  sunkenDeep: [
    { offsetX: -5, offsetY: -5, blurRadius: 10, color: slate.lift, inset: true },
    { offsetX: 5, offsetY: 5, blurRadius: 10, color: slate.shade, inset: true },
  ],
};

/** 4pt grid. Use these rather than raw numbers so rhythm stays consistent. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

/**
 * Corner radii.
 *
 * Generous by design — soft UI depends on it. A tight corner cannot hold a
 * gradient of light across it and the extruded illusion collapses.
 */
export const radius = {
  sm: 12,
  md: 18,
  lg: 26,
  /** Circles: icon bubbles and pills. */
  full: 999,
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  body: 16,
  lg: 20,
  title: 28,
  display: 40,
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

/** Diameter of the circular icon bubbles that carry a habit's icon. */
export const BUBBLE = 48;
