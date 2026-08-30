import { describe, expect, it } from 'vitest';
import { MIN_TOUCH_TARGET, themes, type ThemeColors } from '@/lib/theme';

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

// Pairs the app actually renders. Kept as a function of the theme so both
// palettes are held to the identical standard — a light theme that quietly
// skipped a check would be exactly the kind of gap this exists to prevent.
const textPairs = (t: ThemeColors): [string, string, string][] => [
  ['fg on bg', t.fg, t.bg],
  ['fg on surface', t.fg, t.surface],
  ['fg on bgAlt', t.fg, t.bgAlt],
  ['muted on bg', t.muted, t.bg],
  ['muted on surface', t.muted, t.surface],
  ['muted on bgAlt', t.muted, t.bgAlt],
  ['accent on bg', t.accent, t.bg],
  ['accent on surface', t.accent, t.surface],
  // The filled-button case. Easy to get backwards: on a light accent the
  // readable label is dark, on a dark accent it is light.
  ['onAccent on accent', t.onAccent, t.accent],
  ['error on surface', t.error, t.surface],
  ['success on surface', t.success, t.surface],
  ['warning on surface', t.warning, t.surface],
];

// 1.4.11 covers the visible boundary of a control, which is why borderStrong
// exists separately from the decorative border token.
const uiPairs = (t: ThemeColors): [string, string, string][] => [
  ['borderStrong on bg', t.borderStrong, t.bg],
  ['borderStrong on surface', t.borderStrong, t.surface],
  ['borderStrong on bgAlt', t.borderStrong, t.bgAlt],
];

describe.each(['light', 'dark'] as const)('%s theme', (name) => {
  const theme = themes[name];

  it.each(textPairs(theme))('%s meets AA for normal text', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(uiPairs(theme))('%s meets AA for UI boundaries', (_label, fg, bg) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(AA_UI);
  });

  it('uses six-digit hex for every token, which the contrast maths assumes', () => {
    for (const [token, value] of Object.entries(theme)) {
      expect(value, `${token} in ${name}`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('touch targets', () => {
  it('is at least the 48dp Android guideline', () => {
    expect(MIN_TOUCH_TARGET).toBeGreaterThanOrEqual(48);
  });
});
