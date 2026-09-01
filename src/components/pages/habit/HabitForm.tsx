import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { TimeField } from '@/components/ui/TimeField';
import { Stepper } from '@/components/ui/Stepper';
import { Bubble } from '@/components/ui/Bubble';
import { EVERY_DAY, WEEKDAYS } from '@/lib/date';
import { HabitFace } from '@/components/pages/habit/HabitFace';
import {
  DEFAULT_COLOR,
  DEFAULT_ICON,
  HABIT_COLORS,
  HABIT_EMOJI,
  HABIT_ICONS,
} from '@/lib/habit-style';
import type { HabitInput, ScheduleKind } from '@/lib/db/habits';
import { GUTTER, MIN_TOUCH_TARGET, bevelRound, colors, depth, radius, spacing } from '@/lib/theme';

// Shared by the create and edit screens. Everything a habit's form owns lives
// here so the two screens differ only in what they do with the result.

// Keep in step with the bound in lib/backup.ts, or a habit can be saved that a
// backup of itself would then reject as invalid.
const MAX_NAME = 200;

// Short enough that all three sit across one row. The control directly beneath
// says which is which anyway — 'Weekly' is followed by "How many times a week".
const KINDS: readonly { readonly kind: ScheduleKind; readonly label: string }[] = [
  { kind: 'daily', label: 'Set days' },
  { kind: 'weekly', label: 'Weekly' },
  { kind: 'monthly', label: 'Monthly' },
];

// One completion per day is a database constraint, so a week cannot hold more
// than seven of anything and a month more than thirty-one. Asking for eight a
// week would be asking to fail.
const MAX_PER_WEEK = 7;
const MAX_PER_MONTH = 31;

const maxFor = (kind: ScheduleKind): number =>
  kind === 'weekly' ? MAX_PER_WEEK : MAX_PER_MONTH;

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
  color: DEFAULT_COLOR,
  scheduleKind: 'daily',
  weekdayMask: EVERY_DAY,
  targetCount: 3,
  dueTime: null,
  remindEnabled: false,
  followUps: 3,
  targetPct: 80,
};

interface HabitFormProps {
  initial: HabitInput;
  submitLabel: string;
  /** Rejecting shows the message on the form rather than losing what was typed. */
  onSubmit: (input: HabitInput) => Promise<void>;
  /** Omitted when creating: there is nothing yet to retire. */
  onArchive?: () => void;
}

export function HabitForm({ initial, submitLabel, onSubmit, onArchive }: HabitFormProps) {
  const [name, setName] = useState(initial.name);
  const [icon, setIcon] = useState(initial.icon);
  const [color, setColor] = useState(initial.color);
  const [kind, setKind] = useState<ScheduleKind>(initial.scheduleKind);
  const [weekdayMask, setWeekdayMask] = useState(initial.weekdayMask);
  const [targetCount, setTargetCount] = useState(initial.targetCount);
  const [dueTime, setDueTime] = useState<string | null>(initial.dueTime);
  const [remindEnabled, setRemindEnabled] = useState(initial.remindEnabled);
  const [followUps, setFollowUps] = useState(initial.followUps);
  const [targetPct, setTargetPct] = useState(initial.targetPct);

  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [dayError, setDayError] = useState<string | undefined>(undefined);
  const [timeError, setTimeError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const submit = (): void => {
    const trimmedName = name.trim();

    setNameError(undefined);
    setDayError(undefined);
    setTimeError(undefined);

    if (trimmedName.length === 0) {
      setNameError('A name is required.');
      return;
    }
    if (kind === 'daily' && weekdayMask === 0) {
      // Its own message, announced by the day group rather than by the name
      // field — TextField reads its error as that field's problem, so routing
      // this through it told a screen-reader user their habit's *name* was
      // wrong.
      setDayError('Pick at least one day.');
      return;
    }
    if (remindEnabled && dueTime === null) {
      setTimeError('A reminder needs a time to fire at.');
      return;
    }

    setSaving(true);
    onSubmit({
      name: trimmedName,
      icon,
      color,
      scheduleKind: kind,
      // A flexible habit is not scheduled by its mask, so whatever the day
      // chips were left on is meaningless — but it is still stored, and the
      // backup schema requires at least one bit. Untick every day, switch to
      // Weekly, and the guard above no longer applies: a habit would save with
      // `weekday_mask = 0`, look perfectly normal forever, and then fail
      // validation inside the device's own backup, taking the whole file with
      // it. Store the schema's default instead, symmetrically with the count.
      weekdayMask: kind === 'daily' ? weekdayMask : EVERY_DAY,
      // A daily habit is scheduled by its mask, so a count would be a second
      // source of truth for the same thing. Store the schema's default.
      targetCount: kind === 'daily' ? 1 : Math.min(targetCount, maxFor(kind)),
      dueTime,
      remindEnabled: dueTime === null ? false : remindEnabled,
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
        {/* Twenty-four emoji and twenty-four glyphs: six to a row, eight full
            rows, nothing left hanging off the end of the last one. Cells are a
            fraction of the width rather than a fixed size, so the columns stay
            square on any display. */}
        <View style={styles.grid}>
          {[...HABIT_EMOJI, ...HABIT_ICONS].map((option) => {
            const selected = icon === option;
            return (
              <View key={option} style={styles.cell6}>
                <Pressable
                  onPress={() => setIcon(option)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={option.replace(/-outline$/, '').replace(/-/g, ' ')}
                >
                  <Bubble accent={selected} size={MIN_TOUCH_TARGET}>
                    <HabitFace icon={option} tint={selected ? colors.onAccent : color} size={20} />
                  </Bubble>
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.group}>
        <Text variant="caption" tone="muted">
          Colour
        </Text>
        <View style={styles.grid}>
          {HABIT_COLORS.map((option) => {
            const selected = color === option;
            return (
              <View key={option} style={styles.cell4}>
                <Pressable
                  onPress={() => setColor(option)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`Colour ${HABIT_COLORS.indexOf(option) + 1}`}
                  style={[styles.swatch, { backgroundColor: option }]}
                >
                  {/* A tick rather than a ring, so the choice survives being
                      seen by someone who cannot separate these hues. */}
                  {selected && <Ionicons name="checkmark" size={20} color={colors.onAccent} />}
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.group} accessibilityRole="radiogroup">
        <Text variant="caption" tone="muted">
          Schedule
        </Text>
        <View style={styles.row}>
          {KINDS.map((option) => (
            <Chip
              key={option.kind}
              label={option.label}
              selected={kind === option.kind}
              onPress={() => {
                setKind(option.kind);
                // The count is shared between the two flexible kinds while the
                // ceiling is not. Twenty a month is reasonable; twenty a week is
                // unreachable, because one completion per day is a database
                // constraint — and the habit would then sit at a permanent F
                // with a permanently zero streak, top of "Needs improvement",
                // for weeks completed perfectly.
                setTargetCount((count) => Math.min(count, maxFor(option.kind)));
              }}
              style={styles.grow}
            />
          ))}
        </View>
      </View>

      {kind === 'daily' ? (
        <View style={styles.group}>
          <Text variant="caption" tone="muted">
            Days
          </Text>
          {dayError !== undefined && (
            <Text variant="caption" tone="error" accessibilityLiveRegion="polite">
              {dayError}
            </Text>
          )}
          {/* Seven does not divide by four, and a row of seven would put every
              chip under the 48dp minimum. So the last three are centred beneath
              the first four rather than left hanging at one edge. */}
          <View style={styles.wrap}>
            {WEEKDAYS.map((weekday) => (
              <Chip
                key={weekday.label}
                label={weekday.label}
                selected={(weekdayMask & (1 << weekday.bit)) !== 0}
                onPress={() => setWeekdayMask((mask) => mask ^ (1 << weekday.bit))}
                role="checkbox"
                style={styles.dayChip}
              />
            ))}
          </View>
        </View>
      ) : (
        <Stepper
          label={`How many times ${kind === 'weekly' ? 'a week' : 'a month'}`}
          value={targetCount}
          onChange={setTargetCount}
          min={1}
          max={maxFor(kind)}
          unit={kind === 'weekly' ? 'times a week' : 'times a month'}
        />
      )}

      <TimeField label="Due by" value={dueTime} onChange={setDueTime} error={timeError} />

      <Chip
        label={remindEnabled ? 'Reminders on' : 'Reminders off'}
        selected={remindEnabled}
        onPress={() => setRemindEnabled((on) => !on)}
        role="checkbox"
        accessibilityLabel="Remind me if it is not done"
        accessibilityHint="Sends a notification at the due time, then follow-ups until the habit is ticked"
      />

      {remindEnabled && (
        <View style={styles.group} accessibilityRole="radiogroup">
          <Text variant="caption" tone="muted">
            How much chasing
          </Text>
          {/* Two by two, not four across: '+15/30/60m' needs more width than a
              quarter of the screen leaves it, and a chip whose label wraps to a
              second line is taller than the three beside it. */}
          <View style={styles.pairs}>
            {NAGS.map((option) => (
              <Chip
                key={option.count}
                label={option.label}
                selected={followUps === option.count}
                onPress={() => setFollowUps(option.count)}
                accessibilityHint={
                  option.count === 0
                    ? 'One notification at the due time and nothing more'
                    : 'Follow-up notifications until the habit is ticked'
                }
                style={styles.half}
              />
            ))}
          </View>
        </View>
      )}

      <View style={styles.group} accessibilityRole="radiogroup">
        <Text variant="caption" tone="muted">
          Target completion rate
        </Text>
        <View style={styles.row}>
          {TARGETS.map((pct) => (
            <Chip
              key={pct}
              label={`${pct}%`}
              selected={targetPct === pct}
              onPress={() => setTargetPct(pct)}
              accessibilityLabel={`${pct} percent`}
              style={styles.grow}
            />
          ))}
        </View>
      </View>

      <Button label={saving ? 'Saving…' : submitLabel} onPress={submit} disabled={saving} />

      {/* Retiring a habit is a rare, deliberate act, so it reads as a quiet
          line at the end of the form rather than competing with Save. It still
          gets the full 48dp of touch target — inconspicuous is about weight,
          not about being hard to hit. */}
      {onArchive !== undefined && (
        <Pressable
          onPress={onArchive}
          accessibilityRole="button"
          accessibilityHint="Stops it appearing on Today, but keeps its history"
          style={styles.archive}
        >
          <Ionicons name="archive-outline" size={16} color={colors.muted} />
          <Text variant="caption" tone="muted">
            Archive this habit
          </Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: GUTTER },
  group: { gap: spacing.xs },
  // Every group of choices fills its rows. Forty-three faces in columns of six
  // left one alone on the last line, seven colours left one alone on the
  // second, and three chips sized to their own labels left a ragged gap at the
  // right of the schedule row — the form read as a pile of things that had been
  // dropped rather than laid out.
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.sm },
  cell6: { flexBasis: '16.666%', alignItems: 'center' },
  cell4: { flexBasis: '25%', alignItems: 'center' },
  row: { flexDirection: 'row', gap: spacing.sm },
  grow: { flex: 1, paddingHorizontal: spacing.xs },
  // The one group that cannot divide evenly, so its remainder is centred.
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  pairs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  half: { flexBasis: '47%', flexGrow: 1 },
  dayChip: { width: 68 },
  swatch: {
    ...bevelRound,
    // 48, not 44: the app's own minimum, and these are the smallest things on
    // the screen that have to be hit accurately.
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: depth.raisedSoft,
  },
  archive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    minHeight: MIN_TOUCH_TARGET,
  },
});
