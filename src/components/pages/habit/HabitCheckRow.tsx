import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { HabitFace } from '@/components/pages/habit/HabitFace';
import { Bubble } from '@/components/ui/Bubble';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useAccent } from '@/hooks/useAccent';
import { bevelSunken, colors, depth, radius, spacing } from '@/lib/theme';

// One habit on one day, in three states: done, skipped, or neither.
//
// The whole row ticks it. The face on the left is the habit's own — a glyph or
// an emoji it was given — and the box on the right is the state, where a thumb
// reaches it and where the eye arrives after it already knows what it is
// agreeing to.
//
// Skipping hides behind a long press rather than occupying a second button.
// It is the rarer action by a wide margin, and giving it equal billing made
// every row look like it was asking two questions at once.

interface HabitCheckRowProps {
  name: string;
  /** The human-readable schedule, e.g. "Mon Tue Wed Thu". */
  schedule: string;
  /** An Ionicons name or an emoji. */
  icon: string;
  /** The habit's tint. Applies to a glyph; an emoji keeps its own colours. */
  tint: string;
  done: boolean;
  skipped: boolean;
  /** "1/3 this week · on track" for a flexible habit; absent for a daily one. */
  pace?: string;
  /** Future days cannot be changed. */
  disabled?: boolean;
  onToggle: () => void;
  onSkip: () => void;
}

export function HabitCheckRow({
  name,
  schedule,
  icon,
  tint,
  done,
  skipped,
  pace,
  disabled = false,
  onToggle,
  onSkip,
}: HabitCheckRowProps) {
  const accent = useAccent();
  const detail = skipped ? 'Skipped' : (pace ?? schedule);

  const askToSkip = (): void => {
    if (disabled) return;
    if (skipped) {
      onSkip();
      return;
    }
    Alert.alert(
      `Skip ${name} today?`,
      'It stops asking, and today is left out of your rate rather than counted against it.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Skip today', onPress: onSkip },
      ]
    );
  };

  return (
    <Card style={styles.card}>
      <Pressable
        onPress={skipped ? askToSkip : onToggle}
        onLongPress={askToSkip}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done, disabled }}
        accessibilityLabel={name}
        accessibilityHint={detail}
        // Long-press is discoverable by convention but not by sight, so screen
        // readers get skipping as a named action rather than a gesture.
        accessibilityActions={[
          { name: 'longpress', label: skipped ? 'Un-skip' : 'Skip today' },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === 'longpress') askToSkip();
        }}
        style={[styles.row, disabled ? styles.dimmed : null]}
      >
        <Bubble sunken={skipped}>
          <HabitFace icon={icon} tint={skipped ? colors.muted : tint} />
        </Bubble>

        <View style={styles.labels}>
          <Text variant="heading" style={skipped ? styles.struck : undefined}>
            {name}
          </Text>
          <Text variant="caption" tone="muted">
            {detail}
          </Text>
        </View>

        <View
          style={[
            styles.checkbox,
            done
              ? { ...accent.bevel, backgroundColor: accent.base, boxShadow: depth.raisedSoft }
              : styles.checkboxOff,
          ]}
        >
          {/* Decorative: the state is already announced by the checkbox role
              and the hint, so the glyph must not be read out again. */}
          {done && <Ionicons name="checkmark" size={26} color={colors.onAccent} />}
          {skipped && <Ionicons name="remove" size={24} color={colors.muted} />}
        </View>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dimmed: { opacity: 0.5 },
  labels: { flex: 1, gap: 2 },
  struck: { textDecorationLine: 'line-through' },
  checkbox: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Sunken and bordered: the well says "put something here", and the hairline
  // carries the same message at a contrast the shadow alone cannot promise.
  checkboxOff: {
    ...bevelSunken,
    backgroundColor: colors.bgAlt,
    // The rim that says "put something here" has to clear WCAG 1.4.11's 3:1,
    // which the decorative bevel tones do not, so this one border is overridden.
    borderColor: colors.borderStrong,
    boxShadow: depth.sunken,
  },
});
