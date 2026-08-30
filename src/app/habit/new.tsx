import { useRouter } from 'expo-router';
import { EMPTY_HABIT, HabitForm } from '@/components/pages/habit/HabitForm';
import { Screen } from '@/components/ui/Screen';
import { createHabit, type HabitInput } from '@/lib/db/habits';
import { getActiveProfileId } from '@/lib/db/profiles';
import { syncReminders } from '@/lib/reminders';

export default function NewHabitScreen() {
  const router = useRouter();

  const save = async (input: HabitInput): Promise<void> => {
    const profileId = await getActiveProfileId();
    await createHabit(profileId, input);
    // A new habit with a due time has alerts to place; anything else makes this
    // a cheap no-op that keeps the horizon honest.
    await syncReminders();
    router.back();
  };

  return (
    <Screen>
      <HabitForm initial={EMPTY_HABIT} submitLabel="Add habit" onSubmit={save} />
    </Screen>
  );
}
