import { Pressable, StyleSheet, type ViewStyle } from 'react-native';
import { Text } from '@/components/ui/Text';
import { useAccent } from '@/hooks/useAccent';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '@/lib/theme';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** 'radio' for one-of-many, 'checkbox' for an independent toggle. */
  role?: 'radio' | 'checkbox';
  /** When the visible label is not what a screen reader should hear. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Shape only — width, flex basis. The fill and the rim come from here. */
  style?: ViewStyle;
}

/**
 * A pill that is either chosen or not.
 *
 * The same four styles had been copied into the habit form, the time picker,
 * the analytics range switch and the profile list, which is three chances for
 * them to drift and — once the accent became something you could change — four
 * places to remember to wire it up.
 *
 * Selection is carried by the fill *and* by the state its role announces, never
 * by colour alone. The rim is made from the accent's own tones, so a chosen
 * chip is moulded out of its fill the way every other filled control is.
 */
export function Chip({
  label,
  selected,
  onPress,
  role = 'radio',
  accessibilityLabel,
  accessibilityHint,
  style,
}: ChipProps) {
  const accent = useAccent();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      style={[
        styles.chip,
        selected ? { ...accent.bevel, backgroundColor: accent.base } : styles.off,
        style,
      ]}
    >
      <Text numberOfLines={1} style={selected ? styles.textOn : styles.textOff}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  off: { backgroundColor: 'transparent', borderColor: colors.borderStrong },
  textOn: { color: colors.onAccent },
  textOff: { color: colors.fg },
});
