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
  lift: '#32363e',
  shade: '#0e1013',
  recess: '#16181c',
  // The page, and the two ends of the light falling across it. `page` is the
  // majority colour — the gradient only leans a little either side of it.
  page: '#1d2025',
  pageLight: '#23272e',
  pageDark: '#191c21',
  surfaceLight: '#22252b',
  surfaceDark: '#1b1e23',
  border: '#33373f',
  borderStrong: '#767b85',
  muted: '#9aa0aa',
  fg: '#eef0f3',
} as const;

const hue = {
  // Bright enough to read as a highlight on charcoal, warm enough to feel like
  // a sunrise rather than a warning light.
  ember: '#ff8a3d',
  emberLight: '#ffa563',
  emberDark: '#f0741f',
  emberDim: '#c25a18',
  sage: '#5bd88a',
  rose: '#f98a8a',
  roseLight: '#ffa3a3',
  roseDark: '#e46b6b',
  amber: '#f2c94c',
} as const;

// 2. Semantic tokens.
export interface Colors {
  /** Screen background — and the fill of every raised surface on it. */
  bg: string;
  /** Recessed fill: inputs, track backgrounds, anything pressed into the page. */
  bgAlt: string;
  /** The lit corner of the page gradient — the tightest test any light text faces. */
  bgLight: string;
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
  bgLight: slate.pageLight,
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
 * The light falling across the app, as colour ramps for `expo-linear-gradient`.
 *
 * One source, high and to the right: every surface is lit at its top-right
 * corner and shaded at its bottom-left, and the paired shadows in `depth` throw
 * from the same direction. Lighting a scene from two places is the fastest way
 * to make a soft-UI layout look like a collage.
 *
 * Kept deliberately narrow — a few shades either side of the base, not a wash
 * from light to dark. A strong gradient on a small surface reads as a shaded
 * rectangle rather than as light falling across it, and a page full of them
 * looks like tiles. The shadows do the work of separating surfaces; these only
 * stop them looking flat.
 *
 * These are values for a real native component rather than React Native's
 * `experimental_backgroundImage` style. That style crashes the app outright —
 * `BackgroundImageDrawable.draw` throws during a draw pass when a view carrying
 * one is re-rendered rapidly, which tapping through a calendar does. A native
 * module is a cheap price for not crashing.
 */
export const gradients = {
  // Three stops rather than two across a whole screen: an eight-bit ramp bands
  // into visible stripes, and a midpoint shortens each run enough to hide it.
  page: [slate.pageLight, slate.page, slate.pageDark] as const,
  surface: [slate.surfaceLight, slate.surfaceDark] as const,
  accent: [hue.emberLight, hue.emberDark] as const,
  // Destructive controls need their own ramp. Without one they fell back to the
  // surface ramp, whose opaque stops painted straight over the red fill and
  // left "Erase all data" as dark text on a dark card.
  danger: [hue.roseLight, hue.roseDark] as const,
};

/** Top-right to bottom-left, matching the direction `depth` throws its shadows. */
export const GRADIENT_START = { x: 1, y: 0 } as const;
export const GRADIENT_END = { x: 0, y: 1 } as const;

/**
 * Depth, as a bevelled edge plus a small drop.
 *
 * The earlier version threw a five-pixel highlight with a twelve-pixel blur
 * from both corners, which reaches about eleven pixels past the card — further
 * than the eight-pixel gap between rows, so every card's glow landed on its
 * neighbour and the list read as one smeared column.
 *
 * These stay inside the gap. The edge does the work of separating a surface
 * from the page — a one-pixel lit rim along the top and a dark one beneath —
 * and the drop is only deep enough to say which way is up.
 *
 * Typed as `BoxShadowValue[]` rather than a CSS string so the numbers stay
 * numbers and a typo is a type error.
 */
export const depth: Record<'raised' | 'raisedSoft' | 'sunken' | 'sunkenDeep', BoxShadowValue[]> = {
  raised: [
    { offsetX: 0, offsetY: 2, blurRadius: 5, color: slate.shade },
  ],
  // For small controls, where even that would swamp the element.
  raisedSoft: [
    { offsetX: 0, offsetY: 1, blurRadius: 3, color: slate.shade },
  ],
  sunken: [
    { offsetX: 0, offsetY: 1, blurRadius: 3, color: slate.shade, inset: true },
  ],
  sunkenDeep: [
    { offsetX: 0, offsetY: 2, blurRadius: 5, color: slate.shade, inset: true },
  ],
};

/**
 * A bevelled rim: lit along the top, shaded along the bottom.
 *
 * One hairline, so it costs nothing and cannot overlap anything. This is what
 * actually separates a card from the page now — a rim catches the light of a
 * single overhead source the way a real moulded edge would, where a large blur
 * only ever reads as a glow around a sticker.
 *
 * Sides take a middling tone: a rim lit at the top and shaded at the bottom has
 * to pass through something in between, and jumping straight from one to the
 * other makes the corners look notched.
 *
 * Typed as its own four properties rather than as `ViewStyle`, so it spreads
 * into a `TextInput`'s style as happily as a `View`'s — the wider type carries
 * view-only properties that a text style rejects outright.
 */
/**
 * One device-independent pixel, not `StyleSheet.hairlineWidth`.
 *
 * This module must not import a *value* from react-native: it is read by the
 * Node test suite, which cannot parse react-native's Flow source, and the
 * contrast assertions are only possible because the palette stays plain data.
 * A hairline would be finer, but a rim you cannot quite see is not a bevel.
 */
const BEVEL_WIDTH = 1;

interface Bevel {
  readonly borderWidth: number;
  readonly borderTopColor: string;
  readonly borderLeftColor: string;
  readonly borderRightColor: string;
  readonly borderBottomColor: string;
}

export const bevel: Bevel = {
  borderWidth: BEVEL_WIDTH,
  borderTopColor: slate.lift,
  borderLeftColor: slate.border,
  borderRightColor: slate.border,
  borderBottomColor: slate.shade,
};

/** The same rim inverted, for anything pressed into the page. */
export const bevelSunken: Bevel = {
  borderWidth: BEVEL_WIDTH,
  borderTopColor: slate.shade,
  borderLeftColor: slate.border,
  borderRightColor: slate.border,
  borderBottomColor: slate.lift,
};

/**
 * A single-tone rim, for circles.
 *
 * A per-side bevel needs corners to turn on. On a full circle the four colours
 * meet at arbitrary points on the arc and band visibly, so a bubble takes one
 * tone all the way round.
 */
export const bevelRound: { readonly borderWidth: number; readonly borderColor: string } = {
  borderWidth: BEVEL_WIDTH,
  borderColor: slate.border,
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

/**
 * The gutter between content and the edge of the display.
 *
 * Belongs on a scroll view's *content*, not on the screen around it. A scroll
 * view clips to its own bounds, so a card's shadow is sliced off at the list
 * edge however wide the surrounding padding is — the light has to fall inside
 * the scrolling area, not beside it.
 *
 * Wide enough to clear `depth.raised`, which throws five pixels out with a
 * twelve-pixel blur.
 */
export const GUTTER = spacing.lg;

/** Diameter of the circular icon bubbles that carry a habit's icon. */
export const BUBBLE = 48;
