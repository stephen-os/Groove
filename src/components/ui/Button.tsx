import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from '@/components/ui/Text';
import { colors, depth, MIN_TOUCH_TARGET, radius, spacing } from '@/lib/theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  /** 'primary' fills with the accent; 'secondary' is bare; 'danger' is destructive. */
  tone?: keyof typeof FILLS;
  disabled?: boolean;
  /**
   * Longer description for screen readers, when the label alone is ambiguous
   * out of context — TalkBack users often navigate control-by-control.
   */
  accessibilityHint?: string;
  style?: ViewStyle;
}

const FILLS = {
  primary: { backgroundColor: colors.accent, color: colors.onAccent },
  secondary: { backgroundColor: colors.surface, color: colors.fg },
  danger: { backgroundColor: colors.error, color: colors.onAccent },
} as const;

/**
 * The app's only button.
 *
 * Everything tappable goes through here so three things can't be forgotten:
 * the 48dp minimum hit area, the disabled state being announced rather than
 * just dimmed, and a pressed state that is visible without relying on colour.
 *
 * Pressing swaps the raised shadow for an inset one, so the button physically
 * sinks into the page. That reads as a press even to someone who cannot
 * distinguish the fill from its surroundings.
 */
export function Button({
  label,
  onPress,
  tone = 'primary',
  disabled = false,
  accessibilityHint,
  style,
}: ButtonProps) {
  const { color, backgroundColor } = FILLS[tone];

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
        { backgroundColor },
        pressed ? styles.pressed : styles.raised,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      {/* The label is centred in a full-height row so the touch target stays
          48dp even when the text itself is short. */}
      <View style={styles.content}>
        <Text variant="body" style={{ color, fontWeight: '700' }}>
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
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
  },
  raised: { boxShadow: depth.raised },
  pressed: { boxShadow: depth.sunken },
  disabled: { opacity: 0.45 },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
});
