import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from '@/components/ui/Text';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '@/lib/theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  /** 'primary' fills with the accent; 'secondary' is outlined; 'danger' is destructive. */
  tone?: keyof typeof TONES;
  disabled?: boolean;
  /**
   * Longer description for screen readers, when the label alone is ambiguous
   * out of context — TalkBack users often navigate control-by-control.
   */
  accessibilityHint?: string;
  style?: ViewStyle;
}

// On a filled button the readable foreground is `onAccent`, not the page colour
// — see theme.ts. Outlined buttons draw their label in normal text.
const TONES = {
  primary: { backgroundColor: colors.accent, borderColor: colors.accent, color: colors.onAccent },
  secondary: { backgroundColor: 'transparent', borderColor: colors.borderStrong, color: colors.fg },
  danger: { backgroundColor: colors.error, borderColor: colors.error, color: colors.onAccent },
} as const;

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
  const { color, ...surface } = TONES[tone];

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
        surface,
        { opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {/* The label is centred in a full-height row so the touch target stays
          48dp even when the text itself is short. */}
      <View style={styles.content}>
        <Text variant="body" style={{ color, fontWeight: '600' }}>
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
