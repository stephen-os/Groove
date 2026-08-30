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

/**
 * Emoji a habit can wear instead of a glyph.
 *
 * Stored in the same column as an icon name — one field, because a habit has
 * one face. They are told apart by lookup rather than by a flag: an entry in
 * `HABIT_ICONS` is drawn with Ionicons, anything else is drawn as text.
 *
 * An emoji brings its own colour, so the habit's tint does not apply to one.
 */
export const HABIT_EMOJI: readonly string[] = [
  '🎯', '💪', '🏃', '🧘', '💧', '🥗', '😴', '📚',
  '✍️', '🎸', '🧠', '🦷', '🚿', '🧹', '💊', '☀️',
  '🌙', '💰', '📞', '🌱', '🐕', '☕', '🚭', '🎨',
];

export const DEFAULT_ICON = 'ellipse-outline';

/** Whether this face is drawn as text rather than through Ionicons. */
export function isEmoji(icon: string): boolean {
  return icon.length > 0 && !HABIT_ICONS.includes(icon);
}

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

/**
 * The stored face, or a neutral default when a habit has never been given one.
 *
 * An emoji is passed through as typed — the set above is a shortcut, not a
 * whitelist, so an emoji restored from a backup still renders even if it is not
 * one this build happens to offer.
 */
export function habitIcon(icon: string): string {
  if (icon.length === 0) return DEFAULT_ICON;
  return icon;
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
