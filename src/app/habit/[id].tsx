import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { HabitForm } from '@/components/pages/habit/HabitForm';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { archiveHabit, getHabit, updateHabit, type Habit, type HabitInput } from '@/lib/db/habits';
import { syncReminders } from '@/lib/reminders';

export default function EditHabitScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const habitId = Number.parseInt(id ?? '', 10);

  // A malformed route param is knowable during render, so it is derived rather
  // than pushed into state by an effect.
  const validId = Number.isInteger(habitId);

  const [habit, setHabit] = useState<Habit | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!validId) return;
    let active = true;
    getHabit(habitId)
      .then((found) => {
        if (!active) return;
        if (found) setHabit(found);
        else setNotFound(true);
      })
      .catch((error: unknown) => {
        console.error('Could not load habit:', error);
        if (active) setNotFound(true);
      });
    return () => {
      active = false;
    };
  }, [habitId, validId]);

  const missing = !validId || notFound;

  const save = async (input: HabitInput): Promise<void> => {
    await updateHabit(habitId, input);
    // The schedule or the due time may have moved, so every alert already
    // placed for this habit is potentially wrong.
    await syncReminders();
    router.back();
  };

  const confirmArchive = (): void => {
    if (!habit) return;
    Alert.alert(
      'Archive habit?',
      `"${habit.name}" stops appearing on Today, but its history is kept so your statistics stay honest. You can restore it from the Habits list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: () => {
            archiveHabit(habitId)
              // Archiving is exactly the case the pending alerts must be redrawn
              // for: the habit is gone from Today but its chain is still armed.
              .then(syncReminders)
              .then(() => router.back())
              .catch((error: unknown) => {
                console.error('Could not archive habit:', error);
                Alert.alert('Could not archive that habit.');
              });
          },
        },
      ]
    );
  };

  if (missing) {
    return (
      <Screen>
        <Text variant="heading">That habit no longer exists.</Text>
      </Screen>
    );
  }

  // Null until the read completes. Rendering the form with empty values first
  // would show a blank name for a frame and then replace what was typed. The
  // stack already paints the background, so nothing flashes.
  if (!habit) return null;

  return (
    <Screen>
      <HabitForm
        initial={{
          name: habit.name,
          icon: habit.icon,
          color: habit.color,
          scheduleKind: habit.scheduleKind,
          weekdayMask: habit.weekdayMask,
          targetCount: habit.targetCount,
          dueTime: habit.dueTime,
          remindEnabled: habit.remindEnabled,
          followUps: habit.followUps,
          targetPct: habit.targetPct,
        }}
        submitLabel="Save changes"
        onSubmit={save}
        onArchive={confirmArchive}
      />
    </Screen>
  );
}
