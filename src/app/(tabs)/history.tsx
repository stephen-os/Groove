import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { HabitCheckRow } from '@/components/pages/habit/HabitCheckRow';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { addDays, formatTime, fromDayKey, toDayKey, todayKey, WEEKDAYS } from '@/lib/date';
import { habitColor, habitIcon } from '@/lib/habit-style';
import {
  completionsBetween,
  setStatus,
  type Completion,
  type CompletionStatus,
} from '@/lib/db/completions';
import { listHabitsWithArchived, type Habit } from '@/lib/db/habits';
import { getActiveProfileId } from '@/lib/db/profiles';
import { syncReminders } from '@/lib/reminders';
import {
  describeSchedule,
  groupByDueTime,
  habitsDueOn,
  indexCompletions,
  isEmpty,
  monthRange,
  paceLabel,
  weekRange,
  windowFor,
} from '@/lib/schedule';
import { useAccent } from '@/hooks/useAccent';
import { GUTTER, MIN_TOUCH_TARGET, colors, radius, spacing } from '@/lib/theme';

// Any past day is editable here. Archived habits are loaded too — a day in
// March may have had habits on it that were retired since, and they still
// belong in that day's list.

interface Cell {
  readonly day: string;
  readonly inMonth: boolean;
  readonly future: boolean;
  /** How much of that day was completed, 0–1, or null when nothing was due. */
  readonly ratio: number | null;
}

export default function HistoryScreen() {
  const accent = useAccent();
  const today = todayKey();
  const [anchor, setAnchor] = useState(today);
  const [selected, setSelected] = useState(today);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);

  const month = useMemo(() => monthRange(anchor), [anchor]);

  // The grid is whole weeks, so it runs from the Monday before the 1st to the
  // Sunday after the last day. Loading that exact span means the leading and
  // trailing cells are populated too, rather than looking empty.
  const grid = useMemo(
    () => ({ from: weekRange(month.from).from, to: weekRange(month.to).to }),
    [month]
  );

  // Wider than the grid. A monthly habit on a leading cell is measured against
  // the whole of the previous month, so loading only what is on screen made a
  // met target read as outstanding and dragged those days' bars down.
  const window = useMemo(() => windowFor(grid), [grid]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async (): Promise<void> => {
        const profileId = await getActiveProfileId();
        const [rows, days] = await Promise.all([
          listHabitsWithArchived(profileId),
          completionsBetween(window.from, window.to),
        ]);
        if (!active) return;
        setHabits(rows);
        setCompletions(days);
      };
      load().catch((error: unknown) => console.error('Could not load history:', error));
      return () => {
        active = false;
      };
    }, [window])
  );

  const index = useMemo(() => indexCompletions(completions), [completions]);

  const cells = useMemo(() => {
    const built: Cell[] = [];
    for (let day = grid.from; day <= grid.to; day = addDays(day, 1)) {
      const due = habitsDueOn(habits, index, day);
      const entries = [...due.daily, ...due.weekly, ...due.monthly];
      // Skipped habits leave the denominator entirely — a day you opted out of
      // should not read as a half-finished one.
      const counted = entries.filter((entry) => !entry.skipped);
      const finished = counted.filter((entry) => entry.done).length;
      built.push({
        day,
        inMonth: day >= month.from && day <= month.to,
        future: day > today,
        ratio: counted.length === 0 ? null : finished / counted.length,
      });
    }
    return built;
  }, [grid, month, habits, index, today]);

  const due = useMemo(() => habitsDueOn(habits, index, selected), [habits, index, selected]);

  const mark = useCallback(
    (habitId: number, next: CompletionStatus | null): void => {
      const before = completions.find(
        (entry) => entry.habitId === habitId && entry.day === selected
      );

      const replace = (status: CompletionStatus | null): void => {
        setCompletions((current) => {
          const without = current.filter(
            (entry) => !(entry.habitId === habitId && entry.day === selected)
          );
          return status === null
            ? without
            : [
                ...without,
                { id: -Date.now(), habitId, day: selected, status, doneAt: Date.now() },
              ];
        });
      };

      replace(next);

      setStatus(habitId, selected, next)
        // Editing a past day can change what is still due today — a weekly
        // target met retroactively should stop nagging.
        .then(syncReminders)
        .catch((error: unknown) => {
          console.error('Could not save that change:', error);
          // Put the row back. Without this a failed write left a tick on screen
          // that nothing would correct: this screen only reloads when the month
          // changes, so the false state survived every further interaction.
          replace(before?.status ?? null);
          Alert.alert('Could not save that change.');
        });
    },
    [completions, selected]
  );

  const shiftMonth = (months: number): void => {
    const date = fromDayKey(month.from);
    // Built as a Date rather than by adjusting the month number in the string,
    // which would produce month 0 or 13 at a year boundary.
    const next = toDayKey(new Date(date.getFullYear(), date.getMonth() + months, 1));
    setAnchor(next);

    // The selected day has to move with the month. Leaving it behind renders a
    // day whose completions are no longer loaded, so a fully ticked day shows
    // as empty — and ticking it then deletes the rows it was hiding.
    const range = monthRange(next);
    setSelected(today >= range.from && today <= range.to ? today : range.from);
  };

  // Progress is attached where the shape is still known, rather than recovered
  // afterwards by testing which fields an entry happens to have. Grouped by due
  // time, exactly as Today is, so a past day reads the way it did when it was
  // the present one.
  const groups = groupByDueTime([
    ...due.daily.map((entry) => ({
      habit: entry.habit,
      done: entry.done,
      skipped: entry.skipped,
      pace: undefined as string | undefined,
    })),
    ...[...due.weekly, ...due.monthly].map((entry) => ({
      habit: entry.habit,
      done: entry.done,
      skipped: entry.skipped,
      pace: paceLabel(entry, selected),
    })),
  ]);

  return (
    <Screen edgeToEdgeBottom>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.monthBar}>
          <Pressable
            onPress={() => shiftMonth(-1)}
            accessibilityRole="button"
            accessibilityLabel="Previous month"
            style={styles.monthButton}
          >
            <Ionicons name="chevron-back" size={22} color={accent.base} />
          </Pressable>

          <Text variant="heading">
            {fromDayKey(month.from).toLocaleDateString(undefined, {
              month: 'long',
              year: 'numeric',
            })}
          </Text>

          <Pressable
            onPress={() => shiftMonth(1)}
            accessibilityRole="button"
            accessibilityLabel="Next month"
            style={styles.monthButton}
          >
            <Ionicons name="chevron-forward" size={22} color={accent.base} />
          </Pressable>
        </View>

        <View style={styles.weekdays}>
          {WEEKDAYS.map((weekday) => (
            <Text key={weekday.label} variant="caption" tone="muted" style={styles.weekdayLabel}>
              {weekday.label.slice(0, 1)}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((cell) => {
            const isSelected = cell.day === selected;
            return (
              <Pressable
                key={cell.day}
                onPress={() => setSelected(cell.day)}
                disabled={cell.future}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: cell.future }}
                accessibilityLabel={fromDayKey(cell.day).toLocaleDateString(undefined, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
                accessibilityHint={
                  cell.ratio === null
                    ? 'Nothing scheduled'
                    : `${Math.round(cell.ratio * 100)} percent complete`
                }
                style={[styles.cell, isSelected ? styles.cellSelected : null]}
              >
                <Text
                  variant="caption"
                  tone={cell.inMonth && !cell.future ? 'default' : 'muted'}
                  style={styles.cellNumber}
                >
                  {String(fromDayKey(cell.day).getDate())}
                </Text>
                {/* A bar rather than colour alone: its width is the share of
                    that day that was completed. */}
                <View style={styles.barTrack}>
                  {cell.ratio !== null && (
                    <View
                      style={[
                        styles.barFill,
                        {
                          width: `${Math.max(cell.ratio * 100, cell.ratio > 0 ? 15 : 0)}%`,
                          backgroundColor: cell.ratio === 1 ? colors.success : colors.warning,
                        },
                      ]}
                    />
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text variant="caption" tone="muted" style={styles.selectedLabel}>
          {fromDayKey(selected)
            .toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
            .toUpperCase()}
        </Text>

        {isEmpty(due) ? (
          <Text tone="muted">Nothing was scheduled that day.</Text>
        ) : (
          groups.map((group) => (
            <View key={group.dueTime ?? 'anytime'} style={styles.group}>
              <View style={styles.groupHeader}>
                <Text variant="caption" tone="muted" style={styles.groupLabel}>
                  {(group.dueTime === null ? 'Anytime' : formatTime(group.dueTime)).toUpperCase()}
                </Text>
                <View style={styles.rule} />
              </View>
              {group.data.map((row) => (
                <HabitCheckRow
                  key={row.habit.id}
                  name={row.habit.name}
                  schedule={describeSchedule(row.habit)}
                  icon={habitIcon(row.habit.icon)}
                  tint={habitColor(row.habit.color)}
                  done={row.done}
                  skipped={row.skipped}
                  pace={row.pace}
                  onToggle={() => mark(row.habit.id, row.done ? null : 'done')}
                  onSkip={() => mark(row.habit.id, row.skipped ? null : 'skipped')}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, gap: spacing.sm, paddingVertical: spacing.md },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  monthButton: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdays: { flexDirection: 'row' },
  weekdayLabel: { flex: 1, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    // The app's minimum. Seven of these across a phone is already tight, and a
    // date that needs two attempts to tap is the worst kind of near-miss.
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.sm,
  },
  cellSelected: { backgroundColor: colors.surface },
  cellNumber: { fontVariant: ['tabular-nums'] },
  barTrack: { width: '55%', height: 3, borderRadius: 2, backgroundColor: colors.border },
  barFill: { height: 3, borderRadius: 2 },
  selectedLabel: { marginTop: spacing.md, letterSpacing: 1 },
  group: { gap: spacing.sm },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  groupLabel: { letterSpacing: 1.5 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
