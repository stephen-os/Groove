import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { HabitCheckRow } from '@/components/pages/habit/HabitCheckRow';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { addDays, formatTime, fromDayKey, todayKey } from '@/lib/date';
import { habitColor, habitIcon } from '@/lib/habit-style';
import {
  completionsBetween,
  setStatus,
  type Completion,
  type CompletionStatus,
} from '@/lib/db/completions';
import { listHabits, type Habit } from '@/lib/db/habits';
import { getActiveProfileId } from '@/lib/db/profiles';
import { cancelDayChain, syncReminders } from '@/lib/reminders';
import {
  describeSchedule,
  groupByDueTime,
  habitsDueOn,
  indexCompletions,
  isEmpty,
  paceLabel,
  windowFor,
} from '@/lib/schedule';
import { GUTTER, MIN_TOUCH_TARGET, colors, spacing } from '@/lib/theme';

interface Row {
  readonly habit: Habit;
  readonly done: boolean;
  readonly skipped: boolean;
  /** "2 to go · on track" for a flexible habit; absent for a daily one. */
  readonly pace?: string;
}

export default function TodayScreen() {
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Today is state, not a value recomputed each render. Recomputing it meant a
  // screen left open across midnight still held yesterday in `day` while
  // `today` had moved on: the next tap wrote the completion to yesterday, and
  // only then did the re-render notice and lock the screen read-only.
  const [today, setToday] = useState(todayKey);
  // The day being looked at. Only today can be changed; the rest is a read-only
  // look forward or back, so the screen answers "what does Thursday hold" as
  // well as "what is left now".
  const [day, setDay] = useState(today);
  const readOnly = day !== today;

  // Weekly and monthly habits count completions across their whole period, and
  // a week can straddle a month boundary — so load the union of both ranges
  // rather than the month alone.
  const range = useMemo(() => windowFor({ from: day, to: day }), [day]);

  // Reload on focus rather than on mount: returning from the habit screens has
  // to show the change, and the tab stays mounted between visits. Focusing is
  // also when the date is re-read, so a screen that sat open overnight catches
  // up before anything can be written to the wrong day.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const now = todayKey();
      if (now !== today) {
        setToday(now);
        setDay(now);
      }
      const load = async (): Promise<void> => {
        const profileId = await getActiveProfileId();
        const [rows, days] = await Promise.all([
          listHabits(profileId),
          completionsBetween(range.from, range.to),
        ]);
        if (!active) return;
        setHabits(rows);
        setCompletions(days);
        setLoaded(true);
      };
      load().catch((error: unknown) => {
        console.error('Could not load today:', error);
        if (active) setLoaded(true);
      });
      return () => {
        active = false;
      };
    }, [range, today])
  );

  const due = useMemo(
    () => habitsDueOn(habits, indexCompletions(completions), day),
    [habits, completions, day]
  );

  // One flat list, grouped by the time each habit is due rather than by how it
  // is scheduled. A weekly habit due at 7:00 belongs to the morning alongside
  // the daily ones; what makes it weekly is already on its own row.
  const sections = useMemo(() => {
    const rows: Row[] = [
      ...due.daily.map((entry) => ({
        habit: entry.habit,
        done: entry.done,
        skipped: entry.skipped,
      })),
      ...[...due.weekly, ...due.monthly].map((entry) => ({
        habit: entry.habit,
        done: entry.done,
        skipped: entry.skipped,
        pace: paceLabel(entry, day),
      })),
    ];

    return groupByDueTime(rows).map((group) => ({
      title: group.dueTime === null ? 'Anytime today' : formatTime(group.dueTime),
      data: group.data,
    }));
  }, [due, day]);

  const mark = useCallback(
    (habit: Habit, next: CompletionStatus | null): void => {
      // The row as it stands, so a failure restores this one habit rather than
      // the whole array. Snapshotting everything reverted any *other* tick made
      // while this write was in flight, on screen but not in the database.
      const before = completions.find(
        (entry) => entry.habitId === habit.id && entry.day === day
      );

      const replace = (status: CompletionStatus | null): void => {
        setCompletions((current) => {
          const without = current.filter(
            (entry) => !(entry.habitId === habit.id && entry.day === day)
          );
          return status === null
            ? without
            : [
                ...without,
                { id: -Date.now(), habitId: habit.id, day, status, doneAt: Date.now() },
              ];
        });
      };

      // Move first, persist after: a checkbox that waits on SQLite before it
      // moves feels broken. The id is a placeholder — nothing downstream reads
      // it, and the next focus reload replaces the row with the real one.
      replace(next);

      setStatus(habit.id, day, next)
        .then(() => {
          // Only once the write is committed. Cancelling first meant a failed
          // write left the alerts cancelled for a habit that is not done, and
          // a resync that read the database before the write landed put the
          // wrong alerts back.
          if (next === null) return syncReminders();
          return cancelDayChain(habit.id, day);
        })
        .catch((error: unknown) => {
          console.error('Could not save that change:', error);
          replace(before?.status ?? null);
          Alert.alert('Could not save that.');
        });
    },
    [completions, day]
  );

  const nothingDue = loaded && isEmpty(due);

  return (
    <Screen edgeToEdgeBottom>
      <SectionList
        sections={sections}
        keyExtractor={(row) => String(row.habit.id)}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View style={styles.dateBar}>
            <Pressable
              onPress={() => setDay(addDays(day, -1))}
              accessibilityRole="button"
              accessibilityLabel="Previous day"
              style={styles.arrow}
            >
              <Ionicons name="chevron-back" size={22} color={colors.accent} />
            </Pressable>

            <Pressable
              onPress={() => setDay(today)}
              disabled={!readOnly}
              accessibilityRole="button"
              accessibilityLabel={
                readOnly
                  ? `${fromDayKey(day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}. Back to today`
                  : fromDayKey(day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
              }
              style={styles.dateLabel}
            >
              <Text variant="heading">
                {readOnly
                  ? fromDayKey(day).toLocaleDateString(undefined, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                    })
                  : 'Today'}
              </Text>
              {readOnly && (
                <Text variant="caption" tone="accent">
                  Tap to return to today
                </Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => setDay(addDays(day, 1))}
              accessibilityRole="button"
              accessibilityLabel="Next day"
              style={styles.arrow}
            >
              <Ionicons name="chevron-forward" size={22} color={colors.accent} />
            </Pressable>
          </View>
        }
        renderSectionHeader={({ section }) => (
          // A hairline rule carries the eye across to the time, so a block of
          // habits reads as belonging to it rather than merely following it.
          <View style={styles.sectionHeader}>
            <Text variant="caption" tone="muted" style={styles.section}>
              {section.title.toUpperCase()}
            </Text>
            <View style={styles.rule} />
          </View>
        )}
        ListEmptyComponent={
          nothingDue ? (
            <View style={styles.empty}>
              <Text variant="heading">
                {habits.length === 0 ? 'No habits yet' : 'Nothing scheduled'}
              </Text>
              <Text tone="muted">
                {habits.length === 0
                  ? 'Add one on the Habits tab to start tracking.'
                  : readOnly
                    ? 'Nothing was due that day.'
                    : 'Enjoy the day off.'}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <HabitCheckRow
            name={item.habit.name}
            schedule={describeSchedule(item.habit)}
            icon={habitIcon(item.habit.icon)}
            tint={habitColor(item.habit.color)}
            done={item.done}
            skipped={item.skipped}
            pace={item.pace}
            disabled={readOnly}
            onToggle={() => mark(item.habit, item.done ? null : 'done')}
            onSkip={() => mark(item.habit, item.skipped ? null : 'skipped')}
          />
        )}
      />

    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: GUTTER, gap: spacing.sm, paddingVertical: spacing.md },
  dateBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  dateLabel: { flex: 1, alignItems: 'center' },
  arrow: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  section: { letterSpacing: 1.5 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
});
