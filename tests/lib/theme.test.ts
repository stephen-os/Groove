import { describe, expect, it } from 'vitest';
import { DEFAULT_ICON, HABIT_COLORS, HABIT_EMOJI, HABIT_ICONS, isEmoji } from '@/lib/habit-style';
import {
  ACCENTS,
  ACCENT_KEYS,
  colors,
  DEFAULT_ACCENT,
  gradients,
  MIN_TOUCH_TARGET,
  toAccentKey,
} from '@/lib/theme';

// WCAG 2.1 relative luminance and contrast ratio. Small enough to keep here
// rather than pull in a dependency, and having it in the test file means the
// thresholds and the maths are read together.
const channel = (c: number): number => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const toRgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const luminance = (hex: string): number => {
  const [r, g, b] = toRgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const AA_TEXT = 4.5;
const AA_UI = 3;

// Pairs the app actually renders.
const textPairs: [string, string, string][] = [
  ['fg on bg', colors.fg, colors.bg],
  // The lit corner of the gradient is where light text has least to work with.
  ['fg on the lit corner', colors.fg, colors.bgLight],
  ['muted on the lit corner', colors.muted, colors.bgLight],
  ['fg on surface', colors.fg, colors.surface],
  ['fg on bgAlt', colors.fg, colors.bgAlt],
  ['muted on bg', colors.muted, colors.bg],
  ['muted on surface', colors.muted, colors.surface],
  ['muted on bgAlt', colors.muted, colors.bgAlt],
  ['error on surface', colors.error, colors.surface],
  // The destructive button's own label, which is the pairing that actually
  // ships — asserting only error-on-surface let it render dark-on-dark.
  ['onAccent on error', colors.onAccent, colors.error],
  ['onAccent on the danger ramp start', colors.onAccent, gradients.danger[0]],
  ['onAccent on the danger ramp end', colors.onAccent, gradients.danger[1]],
  ['success on surface', colors.success, colors.surface],
  ['warning on surface', colors.warning, colors.surface],
];

// 1.4.11 covers the visible boundary of a control, which is why borderStrong
// exists separately from the decorative border token. bgAlt is the tightest of
// the three and the one an input border actually sits on.
const uiPairs: [string, string, string][] = [
  ['borderStrong on bg', colors.borderStrong, colors.bg],
  ['borderStrong on surface', colors.borderStrong, colors.surface],
  ['borderStrong on bgAlt', colors.borderStrong, colors.bgAlt],
];

describe('dark palette', () => {
  it.each(textPairs)('%s meets AA for normal text', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(uiPairs)('%s meets AA for UI boundaries', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA_UI);
  });

  it('uses six-digit hex for every token, which the contrast maths assumes', () => {
    for (const [token, value] of Object.entries(colors)) {
      expect(value, token).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

// The habit tints colour an icon and a progress bar, never a paragraph, so the
// bar is WCAG 1.4.11's 3:1 for non-text content rather than the 4.5:1 asked of
// body copy.
// Every accent is a colour someone can actually choose in Settings, so each one
// has to clear the same bar the single hard-coded accent used to. This is the
// test that makes the picker safe: an accent that fails any of these cannot be
// added without turning the suite red.
describe('selectable accents', () => {
  const cases = ACCENT_KEYS.map((key) => [key, ACCENTS[key]] as const);

  it.each(cases)('%s is readable as text on the page', (_key, accent) => {
    expect(contrast(accent.base, colors.bg)).toBeGreaterThanOrEqual(AA_TEXT);
    // The lit corner of the page gradient is the tightest of the three.
    expect(contrast(accent.base, colors.bgLight)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(accent.base, colors.bgAlt)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  // A filled button is a gradient, not a flat colour, so a label has to clear
  // the bar at both ends of the ramp and not merely at the average of them.
  it.each(cases)('%s carries a readable label at every tone', (_key, accent) => {
    for (const tone of [accent.base, accent.light, accent.dark]) {
      expect(contrast(colors.onAccent, tone)).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it.each(cases)('%s uses six-digit hex, which the contrast maths assumes', (_key, accent) => {
    for (const tone of [accent.base, accent.light, accent.dark]) {
      expect(tone).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it.each(cases)('%s is lit from the same corner as its bevel', (_key, accent) => {
    // The gradient runs light to dark and the rim is lit on the same two sides.
    // Getting either backwards makes one filled control on the screen look
    // pressed while every other one looks raised.
    expect(accent.gradient).toEqual([accent.light, accent.dark]);
    expect(accent.bevel.borderTopColor).toBe(accent.light);
    expect(accent.bevel.borderBottomColor).toBe(accent.dark);
    expect(accent.bevelSunken.borderTopColor).toBe(accent.dark);
    expect(accent.bevelSunken.borderBottomColor).toBe(accent.light);
  });

  it('offers distinct colours', () => {
    expect(new Set(cases.map(([, accent]) => accent.base)).size).toBe(cases.length);
  });

  it('keys itself consistently, which is what the stored setting holds', () => {
    for (const [key, accent] of cases) expect(accent.key).toBe(key);
  });
});

describe('toAccentKey', () => {
  it('accepts every accent it offers', () => {
    for (const key of ACCENT_KEYS) expect(toAccentKey(key)).toBe(key);
  });

  it('falls back when nothing has been chosen', () => {
    expect(toAccentKey(null)).toBe(DEFAULT_ACCENT);
  });

  it('falls back rather than trusting a value from the database', () => {
    // The column is free text, and could hold the name of an accent an older
    // build offered. Leaving the app with no highlight colour at all is worse
    // than quietly showing the default.
    expect(toAccentKey('ember')).toBe(DEFAULT_ACCENT);
    expect(toAccentKey('')).toBe(DEFAULT_ACCENT);
    expect(toAccentKey('constructor')).toBe(DEFAULT_ACCENT);
  });
});

describe('habit tints', () => {
  it.each(HABIT_COLORS.map((tint) => [tint] as const))(
    '%s is legible as a graphic on the page',
    (tint) => {
      expect(contrast(tint, colors.bg)).toBeGreaterThanOrEqual(AA_UI);
    }
  );

  it.each(HABIT_COLORS.map((tint) => [tint] as const))(
    '%s is legible on a recessed surface too',
    (tint) => {
      expect(contrast(tint, colors.bgAlt)).toBeGreaterThanOrEqual(AA_UI);
    }
  );

  it('uses six-digit hex throughout, which the contrast maths assumes', () => {
    for (const tint of HABIT_COLORS) expect(tint).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('offers distinct choices', () => {
    expect(new Set(HABIT_COLORS).size).toBe(HABIT_COLORS.length);
  });

  it('does not move when the accent does', () => {
    // A habit's tint is a property of the habit. The first swatch used to be
    // the theme accent itself, so choosing a highlight colour in Settings
    // silently repainted every habit that had taken it.
    const accents = new Set(ACCENT_KEYS.map((key) => ACCENTS[key].base));
    for (const tint of HABIT_COLORS) expect(accents.has(tint)).toBe(false);
  });
});

describe('habit faces', () => {
  it('draws the default face as a glyph, not as its own name', () => {
    // A DEFAULT_ICON outside HABIT_ICONS makes isEmoji true, and every habit
    // that was never given a face renders the literal string in its bubble.
    expect(HABIT_ICONS).toContain(DEFAULT_ICON);
    expect(isEmoji(DEFAULT_ICON)).toBe(false);
  });

  it('treats every offered emoji as an emoji', () => {
    for (const emoji of HABIT_EMOJI) expect(isEmoji(emoji)).toBe(true);
  });

  it('treats every offered glyph as a glyph', () => {
    for (const icon of HABIT_ICONS) expect(isEmoji(icon)).toBe(false);
  });
});

describe('touch targets', () => {
  it('is at least the 48dp Android guideline', () => {
    expect(MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(48);
  });
});
