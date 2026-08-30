import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, depth, gradients, radius, spacing } from '@/lib/theme';

interface CardProps {
  children: React.ReactNode;
  /** Presses the card into the page instead of lifting it out. */
  sunken?: boolean;
  style?: ViewStyle;
}

/**
 * A raised surface — the one definition of what a grouped block looks like.
 *
 * The fill is the same colour as the page. What separates it is the paired
 * shadow: light from the top-left, shade from the bottom-right. Give it a
 * different fill and the soft-UI illusion breaks immediately.
 */
export function Card({ children, sunken = false, style }: CardProps) {
  return <View style={[styles.card, sunken ? styles.sunken : styles.raised, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  raised: { boxShadow: depth.raised, experimental_backgroundImage: gradients.surface },
  sunken: { backgroundColor: colors.bgAlt, boxShadow: depth.sunken },
});
