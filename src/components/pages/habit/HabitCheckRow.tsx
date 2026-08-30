import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '@/lib/theme';

// One habit on one day, in three states: done, skipped, or neither.
//
// Skipping is opting out of that opportunity — it silences the reminder and
// leaves the denominator, so a day you were ill or away does not read as a
// failure. It is a separate control from the checkbox because it means
// something different from "not done yet".

interface HabitCheckRowProps {
  name: string;
  /** The human-readable schedule, e.g. "Mon Tue Wed Thu". */
  schedule: string;
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
  done,
  skipped,
  pace,
  disabled = false,
  onToggle,
  onSkip,
}: HabitCheckRowProps) {
  const detail = skipped ? 'Skipped' : (pace ?? schedule);

  return (
    <Card>
      <View style={styles.row}>
        <Pressable
          onPress={onToggle}
          disabled={disabled || skipped}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done, disabled: disabled || skipped }}
          accessibilityLabel={name}
          accessibilityHint={detail}
          style={[styles.main, disabled ? styles.dimmed : null]}
        >
          <View
            style={[
              styles.checkbox,
              done ? styles.checkboxOn : styles.checkboxOff,
              skipped ? styles.checkboxSkipped : null,
            ]}
          >
            {/* Decorative: the state is already announced by the checkbox role
                and the hint, so the glyph must not be read out again. */}
            {done && <Ionicons name="checkmark" size={22} color={colors.onAccent} />}
            {skipped && <Ionicons name="remove" size={22} color={colors.muted} />}
          </View>

          <View style={styles.labels}>
            <Text variant="heading" style={skipped ? styles.struck : undefined}>
              {name}
            </Text>
            <Text variant="caption" tone="muted">
              {detail}
            </Text>
          </View>
        </Pressable>

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
          style={[styles.skip, disabled ? styles.dimmed : null]}
        >
          <Ionicons
            name={skipped ? 'arrow-undo-outline' : 'play-skip-forward-outline'}
            size={20}
            color={skipped ? colors.accent : colors.muted}
          />
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dimmed: { opacity: 0.5 },
  checkbox: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkboxOff: { backgroundColor: 'transparent', borderColor: colors.borderStrong },
  checkboxSkipped: { borderColor: colors.border, backgroundColor: 'transparent' },
  labels: { flex: 1, gap: spacing.xs },
  struck: { textDecorationLine: 'line-through' },
  skip: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
