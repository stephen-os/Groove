import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { useTheme } from '@/components/layout/ThemeProvider';
import { fontSize } from '@/lib/theme';

const VARIANTS = {
  title: { fontSize: fontSize.title, fontWeight: '700' },
  heading: { fontSize: fontSize.lg, fontWeight: '600' },
  body: { fontSize: fontSize.body, fontWeight: '400' },
  caption: { fontSize: fontSize.sm, fontWeight: '400' },
} as const;

interface TextProps extends RNTextProps {
  variant?: keyof typeof VARIANTS;
  /** 'muted' still meets AA on every background; 'error' for failure messages. */
  tone?: 'default' | 'muted' | 'error' | 'accent';
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
  const { theme } = useTheme();

  const color = {
    default: theme.fg,
    muted: theme.muted,
    error: theme.error,
    accent: theme.accent,
  }[tone];

  return <RNText style={[VARIANTS[variant], { color }, style]} {...rest} />;
}
