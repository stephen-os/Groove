import { colors } from './theme';

// What a habit looks like in a list: a glyph and a tint.
//
// Both are stored as plain strings so the database never has to know about
// Ionicons or about the palette. Both are also optional — a habit created
// before you cared about either still renders, because every lookup falls back
// rather than failing.

/**
 * The icons a habit can wear.
 *
 * A curated set rather than the whole Ionicons catalogue: a picker with two
 * thousand entries is not a choice, it is a search problem, and these cover
 * what a personal habit list actually contains.
 */
export const HABIT_ICONS: readonly string[] = [
  'checkmark-circle-outline',
  'sunny-outline',
  'moon-outline',
  'barbell-outline',
  'walk-outline',
  'bicycle-outline',
  'water-outline',
  'nutrition-outline',
  'book-outline',
  'brush-outline',
  'musical-notes-outline',
  'leaf-outline',
  'heart-outline',
  'bed-outline',
  'call-outline',
  'home-outline',
  'cash-outline',
  'laptop-outline',
];

export const DEFAULT_ICON = HABIT_ICONS[0];

/**
 * Tints a habit can wear, all legible as a graphic on the page.
 *
 * Held to WCAG 1.4.11's 3:1 for non-text content rather than the 4.5:1 asked of
 * body copy — these colour an icon and a progress bar, never a paragraph.
 * `tests/lib/theme.test.ts` asserts it.
 */
export const HABIT_COLORS: readonly string[] = [
  colors.accent,
  '#f2c94c',
  '#5bd88a',
  '#4ecdc4',
  '#6db3f2',
  '#b48ef0',
  '#f98a8a',
];

/** The stored glyph, or the default when a habit has never been given one. */
export function habitIcon(icon: string): string {
  return HABIT_ICONS.includes(icon) ? icon : DEFAULT_ICON;
}

/**
 * The stored tint, or the accent when a habit has never been given one.
 *
 * Checked against the palette rather than trusted: the value arrives from the
 * database and, on a restore, ultimately from a file someone could have edited.
 * An arbitrary string here would be a colour nobody chose at best, and an
 * invisible habit at worst.
 */
export function habitColor(color: string): string {
  return HABIT_COLORS.includes(color) ? color : colors.accent;
}
