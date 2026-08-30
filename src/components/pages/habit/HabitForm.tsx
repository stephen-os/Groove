import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { Bubble } from '@/components/ui/Bubble';
import { EVERY_DAY, WEEKDAYS } from '@/lib/date';
import { DEFAULT_ICON, HABIT_COLORS, HABIT_ICONS } from '@/lib/habit-style';
import type { HabitInput, ScheduleKind } from '@/lib/db/habits';
import { colors, depth, MIN_TOUCH_TARGET, radius, spacing } from '@/lib/theme';

// Shared by the create and edit screens. Everything a habit's form owns lives
// here so the two screens differ only in what they do with the result.

// Keep in step with the bound in lib/backup.ts, or a habit can be saved that a
// backup of itself would then reject as invalid.
const MAX_NAME = 200;

// Same expression the backup schema validates against, so a time this form
// accepts is a time a backup will too.
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const KINDS: readonly { readonly kind: ScheduleKind; readonly label: string }[] = [
  { kind: 'daily', label: 'On set days' },
  { kind: 'weekly', label: 'Times a week' },
  { kind: 'monthly', label: 'Times a month' },
];

const COUNTS: readonly number[] = [1, 2, 3, 4, 5, 6, 7];
const TARGETS: readonly number[] = [60, 70, 80, 90, 100];

// What each follow-up count actually means, said in the words a person would
// use rather than as a bare number.
const NAGS: readonly { readonly count: number; readonly label: string }[] = [
  { count: 0, label: 'Once' },
  { count: 1, label: '+15m' },
  { count: 2, label: '+15/30m' },
  { count: 3, label: '+15/30/60m' },
];

export const EMPTY_HABIT: HabitInput = {
  name: '',
  icon: DEFAULT_ICON,
  color: HABIT_COLORS[0],
  scheduleKind: 'daily',
  weekdayMask: EVERY_DAY,
  targetCount: 3,
  dueTime: null,
  remindEnabled: false,
  followUps: 3,
  targetPct: 80,
};

// Selection is carried by fill as well as by the state each role announces, so
// it never rests on colour alone.
const chipStyle = (selected: boolean) => [styles.chip, selected ? styles.chipOn : styles.chipOff];
const chipText = (selected: boolean) => (selected ? styles.chipTextOn : styles.chipTextOff);

interface HabitFormProps {
  initial: HabitInput;
  submitLabel: string;
  /** Rejecting shows the message on the form rather than losing what was typed. */
  onSubmit: (input: HabitInput) => Promise<void>;
}

export function HabitForm({ initial, submitLabel, onSubmit }: HabitFormProps) {
  const [name, setName] = useState(initial.name);
  const [icon, setIcon] = useState(initial.icon);
  const [color, setColor] = useState(initial.color);
  const [kind, setKind] = useState<ScheduleKind>(initial.scheduleKind);
  const [weekdayMask, setWeekdayMask] = useState(initial.weekdayMask);
  const [targetCount, setTargetCount] = useState(initial.targetCount);
  const [dueTime, setDueTime] = useState(initial.dueTime ?? '');
  const [remindEnabled, setRemindEnabled] = useState(initial.remindEnabled);
  const [followUps, setFollowUps] = useState(initial.followUps);
  const [targetPct, setTargetPct] = useState(initial.targetPct);

  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [timeError, setTimeError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const submit = (): void => {
    const trimmedName = name.trim();
    const trimmedTime = dueTime.trim();

    setNameError(undefined);
    setTimeError(undefined);

    if (trimmedName.length === 0) {
      setNameError('A name is required.');
      return;
    }
    if (kind === 'daily' && weekdayMask === 0) {
      setNameError('Pick at least one day.');
      return;
    }
    if (trimmedTime.length > 0 && !TIME_PATTERN.test(trimmedTime)) {
      setTimeError('Use a 24-hour time, like 07:00.');
      return;
    }
    if (remindEnabled && trimmedTime.length === 0) {
      setTimeError('A reminder needs a time to fire at.');
      return;
    }

    setSaving(true);
    onSubmit({
      name: trimmedName,
      icon,
      color,
      scheduleKind: kind,
      weekdayMask,
      // A daily habit is scheduled by its mask, so a count would be a second
      // source of truth for the same thing. Store the schema's default.
      targetCount: kind === 'daily' ? 1 : targetCount,
      dueTime: trimmedTime.length === 0 ? null : trimmedTime,
      remindEnabled: trimmedTime.length === 0 ? false : remindEnabled,
      followUps,
      targetPct,
    })
      .catch((error: unknown) => {
        console.error('Could not save habit:', error);
        setNameError('Could not save that habit.');
      })
      .finally(() => setSaving(false));
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TextField
        label="Habit"
        value={name}
        onChangeText={setName}
        error={nameError}
        maxLength={MAX_NAME}
        autoFocus={initial.name.length === 0}
        returnKeyType="done"
      />

      <View style={styles.group}>
        <Text variant="caption" tone="muted">
          Icon
        </Text>
        <View style={styles.chips}>
          {HABIT_ICONS.map((option) => {
            const selected = icon === option;
            return (
              <Pressable
                key={option}
                onPress={() => setIcon(option)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={option.replace(/-outline$/, '').replace(/-/g, ' ')}
              >
                <Bubble accent={selected} size={44}>
                  <Ionicons
                    name={option as never}
                    size={20}
                    color={selected ? colors.onAccent : color}
                  />
                </Bubble>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.group}>
        <Text variant="caption" tone="muted">
          Colour
        </Text>
        <View style={styles.chips}>
          {HABIT_COLORS.map((option) => {
            const selected = color === option;
            return (
              <Pressable
                key={option}
                onPress={() => setColor(option)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`Colour ${HABIT_COLORS.indexOf(option) + 1}`}
                style={[styles.swatch, { backgroundColor: option }]}
              >
                {/* A tick rather than a ring, so the choice survives being seen
                    by someone who cannot separate these hues from each other. */}
                {selected && <Ionicons name="checkmark" size={20} color={colors.onAccent} />}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.group} accessibilityRole="radiogroup">
        <Text variant="caption" tone="muted">
          Schedule
        </Text>
        <View style={styles.chips}>
          {KINDS.map((option) => {
            const selected = kind === option.kind;
            return (
              <Pressable
                key={option.kind}
                onPress={() => setKind(option.kind)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                style={chipStyle(selected)}
              >
                <Text style={chipText(selected)}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {kind === 'daily' ? (
        <View style={styles.group}>
          <Text variant="caption" tone="muted">
            Days
          </Text>
          <View style={styles.chips}>
            {WEEKDAYS.map((weekday) => {
              const selected = (weekdayMask & (1 << weekday.bit)) !== 0;
              return (
                <Pressable
                  key={weekday.label}
                  onPress={() => setWeekdayMask((mask) => mask ^ (1 << weekday.bit))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={weekday.label}
                  style={chipStyle(selected)}
                >
                  <Text style={chipText(selected)}>{weekday.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={styles.group} accessibilityRole="radiogroup">
          <Text variant="caption" tone="muted">
            How many times {kind === 'weekly' ? 'a week' : 'a month'}
          </Text>
          <View style={styles.chips}>
            {COUNTS.map((count) => {
              const selected = targetCount === count;
              return (
                <Pressable
                  key={count}
                  onPress={() => setTargetCount(count)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  style={chipStyle(selected)}
                >
                  <Text style={chipText(selected)}>{String(count)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <TextField
        label="Due by (optional, 24-hour)"
        value={dueTime}
        onChangeText={setDueTime}
        error={timeError}
        placeholder="07:00"
        maxLength={5}
        keyboardType="numbers-and-punctuation"
        autoCapitalize="none"
      />

      <Pressable
        onPress={() => setRemindEnabled((on) => !on)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: remindEnabled }}
        accessibilityLabel="Remind me if it is not done"
        accessibilityHint="Sends a notification at the due time, then follow-ups until the habit is ticked"
        style={[styles.toggle, remindEnabled ? styles.chipOn : styles.chipOff]}
      >
        <Text style={chipText(remindEnabled)}>
          {remindEnabled ? 'Reminders on' : 'Reminders off'}
        </Text>
      </Pressable>

      {remindEnabled && (
        <View style={styles.group} accessibilityRole="radiogroup">
          <Text variant="caption" tone="muted">
            How much chasing
          </Text>
          <View style={styles.chips}>
            {NAGS.map((option) => {
              const selected = followUps === option.count;
              return (
                <Pressable
                  key={option.count}
                  onPress={() => setFollowUps(option.count)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityHint={
                    option.count === 0
                      ? 'One notification at the due time and nothing more'
                      : `Follow-up notifications until the habit is ticked`
                  }
                  style={chipStyle(selected)}
                >
                  <Text style={chipText(selected)}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View style={styles.group} accessibilityRole="radiogroup">
        <Text variant="caption" tone="muted">
          Target completion rate
        </Text>
        <View style={styles.chips}>
          {TARGETS.map((pct) => {
            const selected = targetPct === pct;
            return (
              <Pressable
                key={pct}
                onPress={() => setTargetPct(pct)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${pct} percent`}
                style={chipStyle(selected)}
              >
                <Text style={chipText(selected)}>{`${pct}%`}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Button label={saving ? 'Saving…' : submitLabel} onPress={submit} disabled={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingVertical: spacing.md },
  group: { gap: spacing.xs },
  chips: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggle: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: depth.raisedSoft,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipOff: { backgroundColor: 'transparent', borderColor: colors.borderStrong },
  chipTextOn: { color: colors.onAccent },
  chipTextOff: { color: colors.fg },
});
