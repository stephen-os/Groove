import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '@/lib/theme';

// One tickable habit. Shared by Today and by the history editor, which need the
// identical control — the only difference is that history can be looking at a
// day that is not today.

interface HabitCheckRowProps {
  name: string;
  /** The human-readable schedule, e.g. "Mon Tue Wed Thu". */
  schedule: string;
  done: boolean;
  /** "1/3" for a flexible habit; absent for a daily one. */
  progress?: string;
  /** Future days cannot be ticked. */
  disabled?: boolean;
  onToggle: () => void;
}

export function HabitCheckRow({
  name,
  schedule,
  done,
  progress,
  disabled = false,
  onToggle,
}: HabitCheckRowProps) {
  return (
    <Card>
      <Pressable
        onPress={onToggle}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done, disabled }}
        accessibilityLabel={name}
        accessibilityHint={progress === undefined ? schedule : `${schedule}, ${progress} done`}
        style={[styles.row, disabled ? styles.rowDisabled : null]}
      >
        <View style={[styles.checkbox, done ? styles.checkboxOn : styles.checkboxOff]}>
          {/* Decorative: the checked state is already announced by the checkbox
              role, so the tick must not be read out again. */}
          {done && <Ionicons name="checkmark" size={22} color={colors.onAccent} />}
        </View>

        <View style={styles.labels}>
          <Text variant="heading">{name}</Text>
          <Text variant="caption" tone="muted">
            {schedule}
          </Text>
        </View>

        {progress !== undefined && (
          <Text variant="caption" tone="accent" style={styles.progress}>
            {progress}
          </Text>
        )}
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowDisabled: { opacity: 0.5 },
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
  labels: { flex: 1, gap: spacing.xs },
  progress: { fontVariant: ['tabular-nums'] },
});
