import { useCallback, useMemo, useState } from 'react';
import { Alert, SectionList, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { HabitCheckRow } from '@/components/pages/habit/HabitCheckRow';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { fromDayKey, todayKey } from '@/lib/date';
import { completionsBetween, setDone, type Completion } from '@/lib/db/completions';
import { listHabits, type Habit } from '@/lib/db/habits';
import { getActiveProfileId } from '@/lib/db/profiles';
import { cancelDayChain, syncReminders } from '@/lib/reminders';
import {
  describeSchedule,
  habitsDueOn,
  indexCompletions,
  isEmpty,
  monthRange,
  weekRange,
} from '@/lib/schedule';
import { spacing } from '@/lib/theme';

interface Row {
  readonly habit: Habit;
  readonly done: boolean;
  /** "1/3" for a flexible habit; absent for a daily one, which is just done or not. */
  readonly progress?: string;
}

export default function TodayScreen() {
  const router = useRouter();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loaded, setLoaded] = useState(false);

  const day = todayKey();

  // Weekly and monthly habits count completions across their whole period, and
  // a week can straddle a month boundary — so load the union of both ranges
  // rather than the month alone.
  const range = useMemo(() => {
    const week = weekRange(day);
    const month = monthRange(day);
    return {
      from: week.from < month.from ? week.from : month.from,
      to: week.to > month.to ? week.to : month.to,
    };
  }, [day]);

  // Reload on focus rather than on mount: returning from the habit screens has
  // to show the change, and the tab stays mounted between visits.
  useFocusEffect(
    useCallback(() => {
      let active = true;
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
    }, [range])
  );

  const due = useMemo(
    () => habitsDueOn(habits, indexCompletions(completions), day),
    [habits, completions, day]
  );

  const sections = useMemo(() => {
    const built: { title: string; data: Row[] }[] = [];
    if (due.daily.length > 0) {
      built.push({
        title: 'Today',
        data: due.daily.map((entry) => ({ habit: entry.habit, done: entry.done })),
      });
    }
    if (due.weekly.length > 0) {
      built.push({
        title: 'This week',
        data: due.weekly.map((entry) => ({
          habit: entry.habit,
          done: entry.done,
          progress: `${entry.count}/${entry.target}`,
        })),
      });
    }
    if (due.monthly.length > 0) {
      built.push({
        title: 'This month',
        data: due.monthly.map((entry) => ({
          habit: entry.habit,
          done: entry.done,
          progress: `${entry.count}/${entry.target}`,
        })),
      });
    }
    return built;
  }, [due]);

  const toggle = useCallback(
    (habit: Habit, next: boolean): void => {
      // Update first, persist after: a checkbox that waits on SQLite before it
      // moves feels broken. The id is a placeholder — nothing downstream reads
      // it, and the next focus reload replaces the row with the real one.
      setCompletions((current) =>
        next
          ? [...current, { id: -Date.now(), habitId: habit.id, day, doneAt: Date.now() }]
          : current.filter((entry) => !(entry.habitId === habit.id && entry.day === day))
      );

      // Ticking silences the rest of today's chain immediately — that is the
      // whole point of it. Un-ticking has to put the chain back, which needs a
      // full replan, so it takes the slower path.
      if (next) void cancelDayChain(habit.id, day);
      else void syncReminders();

      setDone(habit.id, day, next).catch((error: unknown) => {
        console.error('Could not save that tick:', error);
        setCompletions((current) =>
          next
            ? current.filter((entry) => !(entry.habitId === habit.id && entry.day === day))
            : [...current, { id: -Date.now(), habitId: habit.id, day, doneAt: Date.now() }]
        );
        Alert.alert('Could not save that.');
      });
    },
    [day]
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
          <Text variant="caption" tone="muted" style={styles.date}>
            {fromDayKey(day).toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <Text variant="caption" tone="muted" style={styles.section}>
            {section.title.toUpperCase()}
          </Text>
        )}
        ListEmptyComponent={
          nothingDue ? (
            <View style={styles.empty}>
              <Text variant="heading">
                {habits.length === 0 ? 'No habits yet' : 'Nothing due today'}
              </Text>
              <Text tone="muted">
                {habits.length === 0
                  ? 'Add the first one to start tracking.'
                  : 'Enjoy the day off.'}
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <HabitCheckRow
            name={item.habit.name}
            schedule={describeSchedule(item.habit)}
            done={item.done}
            progress={item.progress}
            onToggle={() => toggle(item.habit, !item.done)}
          />
        )}
      />

      <Button
        label="New habit"
        onPress={() => router.push('/habit/new')}
        style={styles.newButton}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm, paddingVertical: spacing.md },
  date: { marginBottom: spacing.sm },
  section: { marginTop: spacing.sm, letterSpacing: 1 },
  empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
  newButton: { marginBottom: spacing.md },
});
