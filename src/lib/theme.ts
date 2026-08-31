import type { BoxShadowValue } from 'react-native';

// The single source of colour, depth and spacing. Nothing else defines a hex
// value, a shadow or a magic pixel number.
//
// Groove is dark, full stop — there is no light palette, so `colors` is a plain
// object rather than something resolved through a provider. A component imports
// it directly and its styles go straight into `StyleSheet.create`.
//
// The one exception is the accent. It is chosen in Settings, so it cannot be
// baked into a stylesheet at import time; it lives in `ACCENTS` here and is
// read through `useAccent()`, which layers it over the static style. Everything
// else on this page is fixed and stays static.
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
// Neutral charcoal, not blue-grey. The previous greys leaned measurably blue
// (`#1d2025` carries eight more blue than red) and at this brightness the eye
// reads that as navy rather than as a dark grey. These sit within a point or
// two of neutral on every channel, so whichever accent is chosen is the only
// real colour on the screen and the page behind it stays out of the argument.
// The old scheme is kept in `docs/PALETTE-ARCHIVE.md`.
const slate = {
  // The lift and shade that carve a raised surface out of the page.
  lift: '#37373d',
  shade: '#0f0f10',
  recess: '#161617',
  // The page, and the two ends of the light falling across it. `page` is the
  // majority colour — the gradient only leans a little either side of it.
  page: '#1f1f21',
  pageLight: '#26262a',
  pageDark: '#1a1a1c',
  surfaceLight: '#252528',
  surfaceDark: '#1c1c1e',
  border: '#36363b',
  borderStrong: '#7a7a80',
  muted: '#9c9ca3',
  fg: '#f0f0f2',
} as const;

// Semantic hues. These say what happened and are not the user's to choose —
// green means met and red means destructive, whatever the accent is set to.
const hue = {
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
  /**
   * Text and icons drawn ON a saturated fill — any accent, or the danger red.
   *
   * Dark, not the page colour: every fill the app lays down is brighter than
   * its background, so the readable label on one is near-black. Easy to get
   * backwards, which is why the contrast test asserts it for every accent.
   */
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
  // The accent's ramp is not here: it depends on which accent is chosen, so it
  // lives on the `Accent` and reaches a `Surface` through `useAccent()`.
  //
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

/**
 * A bevel made from a fill's own colour.
 *
 * A rim only reads as a moulded edge when it is the surface catching light,
 * which means it has to be that surface's colour. Putting the charcoal bevel on
 * an orange button drew a grey outline around it — the button looked pasted on
 * rather than pressed out, which is why the filled ones never matched the cards
 * around them.
 */
function bevelOf(light: string, dark: string): Bevel {
  return {
    borderWidth: BEVEL_WIDTH,
    borderTopColor: light,
    borderLeftColor: light,
    borderRightColor: dark,
    borderBottomColor: dark,
  };
}

export const bevelDanger = bevelOf(hue.roseLight, hue.roseDark);

/**
 * One colour on all four edges, for overriding a bevel.
 *
 * `borderColor` cannot do this, whatever the order. React Native resolves each
 * edge as `edgeColors[LEFT] ?: edgeColors[HORIZONTAL] ?: edgeColors[ALL]`
 * (BorderColors.kt), and `borderColor` only ever sets ALL — so a per-edge bevel
 * spread into the same style always wins, and the `borderColor` layered over it
 * is dead code that reads as if it works. That cost an input whose validation
 * border never turned red, a time field the same, a selected profile row that
 * never showed its accent, and a checkbox whose comment claimed to be meeting
 * WCAG 1.4.11 while it kept the decorative bevel tones that do not.
 */
export function borderAll(color: string): Bevel {
  return {
    borderWidth: BEVEL_WIDTH,
    borderTopColor: color,
    borderLeftColor: color,
    borderRightColor: color,
    borderBottomColor: color,
  };
}
// Light and shade swapped, for the pressed state. A filled button's inset
// shadow is nearly invisible against a bright fill, so the rim is what has to
// carry the press — and it carries it without relying on colour.
export const bevelDangerSunken = bevelOf(hue.roseDark, hue.roseLight);

// 3. Accents — the one part of the palette that is the user's to choose.

export type AccentKey =
  | 'orange'
  | 'yellow'
  | 'green'
  | 'teal'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'red';

/**
 * A highlight colour, with everything derived from it that the app draws.
 *
 * Three tones rather than one. `base` is the flat fill; `light` and `dark` are
 * the ends of the gradient across it and the two halves of its bevel, so a
 * filled control is lit from the same corner as every card around it. Deriving
 * them here rather than at each call site is what stops a new accent arriving
 * with a rim that does not match its own fill.
 */
export interface Accent {
  readonly key: AccentKey;
  /** Shown in the Settings picker. */
  readonly label: string;
  readonly base: string;
  readonly light: string;
  readonly dark: string;
  readonly gradient: readonly [string, string];
  readonly bevel: Bevel;
  readonly bevelSunken: Bevel;
}

/**
 * Every accent is held to the bar the single accent used to be: 4.5:1 against
 * `onAccent` at all three tones, and 4.5:1 against the page, because an accent
 * is drawn as bare text and as bare icons as well as behind a label.
 * `tests/lib/theme.test.ts` asserts all of them, so one that fails cannot ship.
 *
 * Orange is deliberately darker than it was. The old `#ff8a3d` sat near the top
 * of that range and glared against the page; this is a couple of steps down,
 * and its light and dark ends are closer together so a filled control reads as
 * lit rather than as two-tone.
 */
const RAMPS: Record<AccentKey, readonly [string, string, string, string]> = {
  orange: ['Orange', '#ee7b2f', '#f7914b', '#d9661d'],
  yellow: ['Yellow', '#e0ac2b', '#edbb45', '#c8941a'],
  green: ['Green', '#4dbf6c', '#66cd82', '#38a857'],
  teal: ['Teal', '#32bfb0', '#4fd0c2', '#20a698'],
  blue: ['Blue', '#4f9bf5', '#6cadf8', '#357fdb'],
  purple: ['Purple', '#a279f2', '#b493f6', '#9366e6'],
  pink: ['Pink', '#e074d2', '#e98cdd', '#c95abb'],
  red: ['Red', '#ef6f6f', '#f78b8b', '#d95555'],
};

export const ACCENTS: Record<AccentKey, Accent> = Object.fromEntries(
  Object.entries(RAMPS).map(([key, [label, base, light, dark]]) => [
    key,
    {
      key: key as AccentKey,
      label,
      base,
      light,
      dark,
      gradient: [light, dark] as const,
      bevel: bevelOf(light, dark),
      bevelSunken: bevelOf(dark, light),
    } satisfies Accent,
  ])
) as Record<AccentKey, Accent>;

/** Every accent, in picker order: warm through cool and back round. */
export const ACCENT_KEYS = Object.keys(RAMPS) as AccentKey[];

export const DEFAULT_ACCENT: AccentKey = 'orange';

/**
 * Narrows a value read from the database.
 *
 * The setting is a free-text column and could hold the name of an accent an
 * older build offered, so an unknown one falls back rather than leaving the app
 * with no highlight colour at all.
 */
export function toAccentKey(value: string | null): AccentKey {
  // `hasOwn`, not `in`: `in` walks the prototype chain, so 'constructor' and
  // 'toString' passed the guard and handed the app `Object.prototype.constructor`
  // as its accent — a function, which every read of `.base` then blanked.
  return value !== null && Object.hasOwn(ACCENTS, value) ? (value as AccentKey) : DEFAULT_ACCENT;
}

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
