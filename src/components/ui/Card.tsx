import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Surface } from '@/components/ui/Surface';
import { colors, depth, radius, spacing } from '@/lib/theme';

interface CardProps {
  children: React.ReactNode;
  /** Presses the card into the page instead of lifting it out. */
  sunken?: boolean;
  style?: ViewStyle;
}

/**
 * A raised surface — the one definition of what a grouped block looks like.
 *
 * The fill is only a shade off the page. What separates it is the paired
 * shadow: light from the top-left, shade from the bottom-right. Give it a
 * strongly different fill and the soft-UI illusion breaks immediately.
 */
export function Card({ children, sunken = false, style }: CardProps) {
  if (sunken) {
    return <View style={[styles.card, styles.sunken, style]}>{children}</View>;
  }
  return (
    <Surface ramp="surface" style={[styles.card, styles.raised, style ?? {}]}>
      {children}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  raised: { boxShadow: depth.raised },
  sunken: { backgroundColor: colors.bgAlt, boxShadow: depth.sunken },
});
