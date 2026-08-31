import { useCallback, useState } from 'react';
import { Alert, Pressable, SectionList, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';
import { HabitFace } from '@/components/pages/habit/HabitFace';
import { Bubble } from '@/components/ui/Bubble';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  archiveHabit,
  deleteHabit,
  listArchivedHabits,
  listHabits,
  restoreHabit,
  type Habit,
} from '@/lib/db/habits';
import { habitColor, habitIcon } from '@/lib/habit-style';
import { getActiveProfileId } from '@/lib/db/profiles';
import { syncReminders } from '@/lib/reminders';
import { describeSchedule } from '@/lib/schedule';
import { GUTTER, MIN_TOUCH_TARGET, colors, spacing } from '@/lib/theme';

export default function ManageHabitsScreen() {
  const router = useRouter();
  const [active, setActive] = useState<Habit[]>([]);
  const [archived, setArchived] = useState<Habit[]>([]);

  const load = useCallback(async (): Promise<void> => {
    const profileId = await getActiveProfileId();
    const [live, retired] = await Promise.all([
      listHabits(profileId),
      listArchivedHabits(profileId),
    ]);
    // Alphabetical, not by due time. This is the list you come to when you want
    // to find a particular habit and change it, and the only order that helps
    // with that is the one you can predict from its name. Today sorts by when
    // things are due, because there the question is what happens next.
    setActive([...live].sort((a, b) => a.name.localeCompare(b.name)));
    setArchived(retired);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch((error: unknown) => console.error('Could not load habits:', error));
    }, [load])
  );

  const run = useCallback(
    (action: Promise<void>, failure: string): void => {
      action
        // Archiving, restoring and deleting all change what is due, and so
        // what should still be pending with the OS.
        .then(syncReminders)
        .then(load)
        .catch((error: unknown) => {
          console.error(failure, error);
          Alert.alert(failure);
        });
    },
    [load]
  );

  const confirmArchive = (habit: Habit): void => {
    Alert.alert(
      'Archive habit?',
      `"${habit.name}" stops appearing on Today, but its history is kept so your statistics stay honest. You can restore it later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: () => run(archiveHabit(habit.id), 'Could not archive that habit.'),
        },
      ]
    );
  };

  const confirmDelete = (habit: Habit): void => {
    Alert.alert(
      'Delete permanently?',
      `This erases "${habit.name}" and every day it was ever completed. It cannot be undone — archiving keeps the history instead.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => run(deleteHabit(habit.id), 'Could not delete that habit.'),
        },
      ]
    );
  };

  const sections = [
    { title: 'Active', data: active },
    ...(archived.length > 0 ? [{ title: 'Archived', data: archived }] : []),
  ];

  return (
    <Screen edgeToEdgeBottom>
      <SectionList
        sections={sections}
        keyExtractor={(habit) => String(habit.id)}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) =>
          section.data.length === 0 ? null : (
            <Text variant="caption" tone="muted" style={styles.section}>
              {section.title.toUpperCase()}
            </Text>
          )
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text variant="heading">No habits yet</Text>
            <Text tone="muted">
              Everything you track lives here — add the first one below.
            </Text>
          </View>
        }
        renderItem={({ item, section }) => {
          const isArchived = section.title === 'Archived';
          return (
            <Card>
              <Pressable
                onPress={() => router.push(`/habit/${item.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Edit ${item.name}`}
                accessibilityHint={describeSchedule(item)}
                disabled={isArchived}
                style={styles.row}
              >
                <Bubble size={40}>
                  {/* HabitFace, not Ionicons: half the pickable faces are emoji
                      and the icon font draws nothing at all for those. */}
                  <HabitFace
                    icon={habitIcon(item.icon)}
                    tint={habitColor(item.color)}
                    size={18}
                  />
                </Bubble>
                <View style={styles.labels}>
                  <Text variant="heading">{item.name}</Text>
                  <Text variant="caption" tone="muted">
                    {describeSchedule(item)}
                    {item.dueTime !== null ? ` · by ${item.dueTime}` : ''}
                    {item.remindEnabled ? ' · reminders on' : ''}
                  </Text>
                </View>
                {!isArchived && (
                  <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                )}
              </Pressable>

              <View style={styles.actions}>
                {isArchived ? (
                  <>
                    <Button
                      label="Restore"
                      tone="secondary"
                      onPress={() => run(restoreHabit(item.id), 'Could not restore that habit.')}
                      accessibilityHint={`Brings ${item.name} back to Today`}
                      style={styles.action}
                    />
                    <Button
                      label="Delete"
                      tone="danger"
                      onPress={() => confirmDelete(item)}
                      accessibilityHint={`Erases ${item.name} and all its history`}
                      style={styles.action}
                    />
                  </>
                ) : (
                  <Button
                    label="Archive"
                    tone="secondary"
                    onPress={() => confirmArchive(item)}
                    accessibilityHint={`Retires ${item.name} but keeps its history`}
                    style={styles.action}
                  />
                )}
              </View>
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
  list: { paddingHorizontal: GUTTER, gap: spacing.sm, paddingVertical: spacing.md },
  section: { marginTop: spacing.sm, letterSpacing: 1 },
  empty: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH_TARGET },
  labels: { flex: 1, gap: spacing.xs },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  action: { flex: 1 },
  // Margin, not padding: the button sits outside the scrolling list, and its
  // own shadow needs the same room from the display edge that the cards get.
  newButton: { marginBottom: spacing.md, marginHorizontal: GUTTER },
});
