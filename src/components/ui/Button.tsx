import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from '@/components/layout/ThemeProvider';
import { Text } from '@/components/ui/Text';
import { MIN_TOUCH_TARGET, radius, spacing } from '@/lib/theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  /** 'primary' fills with the accent; 'secondary' is outlined; 'danger' is destructive. */
  tone?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  /**
   * Longer description for screen readers, when the label alone is ambiguous
   * out of context — TalkBack users often navigate control-by-control.
   */
  accessibilityHint?: string;
  style?: ViewStyle;
}

/**
 * The app's only button.
 *
 * Everything tappable goes through here so three things can't be forgotten:
 * the 48dp minimum hit area, the disabled state being announced rather than just
 * greyed out, and a pressed state that is visible without relying on colour.
 */
export function Button({
  label,
  onPress,
  tone = 'primary',
  disabled = false,
  accessibilityHint,
  style,
}: ButtonProps) {
  const { theme } = useTheme();

  const background = {
    primary: theme.accent,
    secondary: 'transparent',
    danger: theme.error,
  }[tone];

  // On a filled button the readable foreground is `onAccent`, not the page
  // colour — see theme.ts. Outlined buttons draw their label in normal text.
  const labelColor = tone === 'secondary' ? theme.fg : theme.onAccent;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      // Announces "dimmed"/"disabled" instead of leaving a screen-reader user to
      // infer it from a colour they may not perceive.
      accessibilityState={{ disabled }}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: background,
          borderColor: tone === 'secondary' ? theme.borderStrong : background,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {/* The label is centred in a full-height row so the touch target stays
          48dp even when the text itself is short. */}
      <View style={styles.content}>
        <Text variant="body" style={{ color: labelColor, fontWeight: '600' }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
