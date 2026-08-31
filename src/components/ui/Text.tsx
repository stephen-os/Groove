import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { colors, fontSize } from '@/lib/theme';

const VARIANTS = {
  title: { fontSize: fontSize.title, fontWeight: '700' },
  heading: { fontSize: fontSize.lg, fontWeight: '600' },
  body: { fontSize: fontSize.body, fontWeight: '400' },
  caption: { fontSize: fontSize.sm, fontWeight: '400' },
} as const;

const TONES = {
  default: { color: colors.fg },
  muted: { color: colors.muted },
  error: { color: colors.error },
} as const;

interface TextProps extends RNTextProps {
  variant?: keyof typeof VARIANTS;
  /**
   * 'muted' still meets AA on every background; 'error' for failure messages.
   *
   * There is no accent tone. The accent is chosen at runtime and this component
   * is on nearly every line of the app — the one place that wants accent text
   * reads `useAccent()` and passes a colour, rather than every `Text` in the
   * tree subscribing to a context it does not use.
   */
  tone?: keyof typeof TONES;
}

/**
 * Themed text. Use this instead of react-native's `Text` so colour comes from
 * the palette and font sizes come from the scale.
 *
 * Note it does not set `allowFontScaling={false}`. Honouring the system font
 * size is an accessibility requirement, and turning it off is the single most
 * common way a mobile app becomes unusable for someone who needs large type.
 */
export function Text({ variant = 'body', tone = 'default', style, ...rest }: TextProps) {
  return <RNText style={[VARIANTS[variant], TONES[tone], style]} {...rest} />;
}
