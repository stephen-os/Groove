import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Surface } from '@/components/ui/Surface';
import { BUBBLE, colors, depth, radius } from '@/lib/theme';

interface BubbleProps {
  children: React.ReactNode;
  /** Pressed into the page rather than lifted out of it. */
  sunken?: boolean;
  /** Fills with the accent — for the one thing on screen that is active. */
  accent?: boolean;
  size?: number;
  style?: ViewStyle;
}

/**
 * A circular raised well for an icon.
 *
 * The repeating motif of the design: every icon sits in one of these rather
 * than floating on the page, which is what gives a list its rhythm when the
 * rows themselves are otherwise identical.
 */
export function Bubble({ children, sunken = false, accent = false, size = BUBBLE, style }: BubbleProps) {
  const shape = { width: size, height: size, borderRadius: radius.full };

  if (sunken) {
    return <View style={[styles.bubble, shape, styles.sunken, style]}>{children}</View>;
  }
  return (
    <Surface
      ramp={accent ? 'accent' : 'surface'}
      style={[styles.bubble, shape, styles.raised, style ?? {}]}
    >
      {children}
    </Surface>
  );
}

const styles = StyleSheet.create({
  bubble: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  raised: { boxShadow: depth.raisedSoft },
  sunken: { backgroundColor: colors.bgAlt, boxShadow: depth.sunken },
});
