import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Bubble } from '@/components/ui/Bubble';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { colors, depth, MIN_TOUCH_TARGET, radius, spacing } from '@/lib/theme';

// One habit on one day, in three states: done, skipped, or neither.
//
// Reading order is icon, name, then the control that changes it — the tick sits
// on the right, where a thumb reaches it and where the eye arrives last, after
// it already knows what it is agreeing to.
//
// Skipping is opting out of that opportunity: it silences the reminder and
// leaves the denominator, so a day you were ill or away does not read as a
// failure. It is a separate control from the checkbox because it means
// something different from "not done yet".

interface HabitCheckRowProps {
  name: string;
  /** The human-readable schedule, e.g. "Mon Tue Wed Thu". */
  schedule: string;
  /** Ionicons glyph for the habit's bubble. */
  icon: string;
  /** The habit's tint, used for its glyph when it is neither done nor skipped. */
  tint: string;
  done: boolean;
  skipped: boolean;
  /** "2 to go · on track" for a flexible habit; absent for a daily one. */
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
  const detail = skipped ? 'Skipped' : (pace ?? schedule);

  return (
    <Card style={styles.card}>
      <View style={[styles.row, disabled ? styles.dimmed : null]}>
        <Bubble accent={done} sunken={skipped}>
          <Ionicons
            name={icon as never}
            size={22}
            color={done ? colors.onAccent : skipped ? colors.muted : tint}
          />
        </Bubble>

        {/* Tapping the label skips, because it is the larger target and the
            less destructive of the two things this row can do. */}
        <Pressable
          onPress={onSkip}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ selected: skipped, disabled }}
          accessibilityLabel={skipped ? `Un-skip ${name}` : `Skip ${name}`}
          accessibilityHint={
            skipped
              ? 'Puts this back on the list for today'
              : 'Opts out of today without counting it against you'
          }
          style={styles.labels}
        >
          <Text variant="heading" style={skipped ? styles.struck : undefined}>
            {name}
          </Text>
          <Text variant="caption" tone="muted">
            {detail}
          </Text>
        </Pressable>

        <Pressable
          onPress={onToggle}
          disabled={disabled || skipped}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done, disabled: disabled || skipped }}
          accessibilityLabel={name}
          accessibilityHint={detail}
          style={styles.checkTarget}
        >
          <View style={[styles.checkbox, done ? styles.checkboxOn : styles.checkboxOff]}>
            {/* Decorative: the state is already announced by the checkbox role
                and the hint, so the glyph must not be read out again. */}
            {done && <Ionicons name="checkmark" size={20} color={colors.onAccent} />}
          </View>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dimmed: { opacity: 0.5 },
  labels: { flex: 1, gap: 2 },
  struck: { textDecorationLine: 'line-through' },
  checkTarget: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkbox: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.accent, boxShadow: depth.raisedSoft },
  // Sunken and bordered: the well says "put something here", and the hairline
  // carries the same message at a contrast the shadow alone cannot promise.
  checkboxOff: {
    backgroundColor: colors.bgAlt,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    boxShadow: depth.sunken,
  },
});
