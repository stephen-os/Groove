import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { fromDayKey, todayKey, WEEKDAYS } from '@/lib/date';
import { completedOn, setDone } from '@/lib/db/completions';
import { archiveHabit, listHabits, type Habit } from '@/lib/db/habits';
import { getActiveProfileId } from '@/lib/db/profiles';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '@/lib/theme';

// Every active habit is listed here, whatever its schedule. Filtering the list
// down to the ones actually due today is `habitsDueOn`, which is the next piece
// of work — until it exists this screen is deliberately showing too much rather
// than guessing at the rule.

const describeSchedule = (habit: Habit): string => {
  if (habit.scheduleKind === 'weekly') return `${habit.targetCount}x per week`;
  if (habit.scheduleKind === 'monthly') return `${habit.targetCount}x per month`;

  const days = WEEKDAYS.filter((weekday) => (habit.weekdayMask & (1 << weekday.bit)) !== 0);
  if (days.length === WEEKDAYS.length) return 'Every day';
  if (days.length === 0) return 'No days selected';
  return days.map((weekday) => weekday.label).join(' ');
};

export default function TodayScreen() {
  const router = useRouter();
  const [habits, setHabits] = useState<Habit[]>([]);
  const [done, setDoneIds] = useState<Set<number>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const day = todayKey();

  // Reload on focus rather than on mount: returning from the create screen has
  // to show the new habit, and the tab stays mounted between visits.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async (): Promise<void> => {
        const profileId = await getActiveProfileId();
        const [rows, completed] = await Promise.all([listHabits(profileId), completedOn(day)]);
        if (!active) return;
        setHabits(rows);
        setDoneIds(completed);
        setLoaded(true);
      };
      load().catch((error: unknown) => {
        console.error('Could not load habits:', error);
        if (active) setLoaded(true);
      });
      return () => {
        active = false;
      };
    }, [day])
  );

  const toggle = useCallback(
    (habit: Habit): void => {
      const next = !done.has(habit.id);
      // Update first, persist after: a checkbox that waits on SQLite before it
      // moves feels broken, and the write cannot meaningfully fail here.
      setDoneIds((current) => {
        const updated = new Set(current);
        if (next) updated.add(habit.id);
        else updated.delete(habit.id);
        return updated;
      });
      setDone(habit.id, day, next).catch((error: unknown) => {
        console.error('Could not save that tick:', error);
        setDoneIds((current) => {
          const reverted = new Set(current);
          if (next) reverted.delete(habit.id);
          else reverted.add(habit.id);
          return reverted;
        });
        Alert.alert('Could not save that.');
      });
    },
    [day, done]
  );

  const confirmArchive = useCallback((habit: Habit): void => {
    Alert.alert(
      'Archive habit?',
      `"${habit.name}" stops appearing here, but its history is kept so your statistics stay honest.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          style: 'destructive',
          onPress: () => {
            archiveHabit(habit.id)
              .then(() =>
                setHabits((current) => current.filter((existing) => existing.id !== habit.id))
              )
              .catch((error: unknown) => {
                console.error('Could not archive habit:', error);
                Alert.alert('Could not archive that habit.');
              });
          },
        },
      ]
    );
  }, []);

  return (
    <Screen edgeToEdgeBottom>
      <FlatList
        data={habits}
        keyExtractor={(habit) => String(habit.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <Text variant="caption" tone="muted">
            {fromDayKey(day).toLocaleDateString(undefined, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </Text>
        }
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <Text variant="heading">No habits yet</Text>
              <Text tone="muted">Add the first one to start tracking.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const checked = done.has(item.id);
          return (
            <Card>
              <View style={styles.row}>
                <Pressable
                  onPress={() => toggle(item)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={item.name}
                  accessibilityHint={describeSchedule(item)}
                  style={[styles.checkbox, checked ? styles.checkboxOn : styles.checkboxOff]}
                >
                  {/* Decorative: the checked state is already announced by the
                      checkbox role, so the tick must not be read out again. */}
                  {checked && <Ionicons name="checkmark" size={22} color={colors.onAccent} />}
                </Pressable>

                <View style={styles.labels}>
                  <Text variant="heading">{item.name}</Text>
                  <Text variant="caption" tone="muted">
                    {describeSchedule(item)}
                  </Text>
                </View>
              </View>

              <Button
                label="Archive"
                tone="secondary"
                onPress={() => confirmArchive(item)}
                accessibilityHint={`Archives ${item.name}`}
                style={styles.archiveButton}
              />
            </Card>
          );
        }}
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
  empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
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
  archiveButton: { marginTop: spacing.sm },
  newButton: { marginBottom: spacing.md },
});
