import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/ui/Text';
import { useAccentChoice } from '@/hooks/useAccent';
import { ACCENTS, ACCENT_KEYS, bevelRound, colors, depth, MIN_TOUCH_TARGET, radius, spacing } from '@/lib/theme';

/**
 * Picks the app's highlight colour.
 *
 * Eight swatches rather than a colour wheel. Every one of them is measured
 * against the page and against the label drawn on it, which is the whole reason
 * the set is closed — an arbitrary colour would be a highlight nobody can read
 * about a third of the time, and the contrast test cannot check a colour that
 * does not exist until someone drags a slider.
 *
 * The choice applies as you tap it: the swatches, the tick, and everything
 * behind this screen repaint at once, so the decision is made by looking rather
 * than by imagining.
 */
export function AccentPicker() {
  const { accent, choose } = useAccentChoice();

  return (
    <View style={styles.grid}>
      {ACCENT_KEYS.map((key) => {
        const option = ACCENTS[key];
        const selected = accent.key === key;
        return (
          <View key={key} style={styles.cell}>
            <Pressable
              onPress={() => choose(key)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={option.label}
              style={[styles.swatch, { backgroundColor: option.base, borderColor: option.dark }]}
            >
              {/* A tick, not a ring: the one thing this control must not do is
                  signal its own state with colour alone. */}
              {selected && <Ionicons name="checkmark" size={22} color={colors.onAccent} />}
            </Pressable>
            <Text variant="caption" tone={selected ? 'default' : 'muted'}>
              {option.label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.md,
    marginTop: spacing.sm,
  },
  cell: { flexBasis: '25%', alignItems: 'center', gap: spacing.xs },
  swatch: {
    ...bevelRound,
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: depth.raisedSoft,
  },
});
