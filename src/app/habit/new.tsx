import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/components/layout/ThemeProvider';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { EVERY_DAY, WEEKDAYS } from '@/lib/date';
import { createHabit, type ScheduleKind } from '@/lib/db/habits';
import { getActiveProfileId } from '@/lib/db/profiles';
import { MIN_TOUCH_TARGET, radius, spacing } from '@/lib/theme';

// Keep in step with the bound in lib/backup.ts, or a habit can be saved that a
// backup of itself would then reject as invalid.
const MAX_NAME = 200;

const KINDS: readonly { readonly kind: ScheduleKind; readonly label: string }[] = [
  { kind: 'daily', label: 'On set days' },
  { kind: 'weekly', label: 'Times a week' },
  { kind: 'monthly', label: 'Times a month' },
];

const COUNTS: readonly number[] = [1, 2, 3, 4, 5, 6, 7];

export default function NewHabitScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ScheduleKind>('daily');
  const [weekdayMask, setWeekdayMask] = useState(EVERY_DAY);
  const [targetCount, setTargetCount] = useState(3);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const chipStyle = (selected: boolean) => [
    styles.chip,
    {
      backgroundColor: selected ? theme.accent : 'transparent',
      borderColor: selected ? theme.accent : theme.borderStrong,
    },
  ];
  const chipTextColor = (selected: boolean) => ({ color: selected ? theme.onAccent : theme.fg });

  const save = (): void => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setError('A name is required.');
      return;
    }
    if (trimmed.length > MAX_NAME) {
      setError(`Keep the name under ${MAX_NAME} characters.`);
      return;
    }
    if (kind === 'daily' && weekdayMask === 0) {
      setError('Pick at least one day.');
      return;
    }
    setError(undefined);
    setSaving(true);

    const persist = async (): Promise<void> => {
      const profileId = await getActiveProfileId();
      await createHabit({
        profileId,
        name: trimmed,
        scheduleKind: kind,
        weekdayMask,
        // A daily habit is scheduled by its mask, so a count would be a second
        // source of truth for the same thing. Store the schema's default.
        targetCount: kind === 'daily' ? 1 : targetCount,
      });
      router.back();
    };

    persist()
      .catch((err: unknown) => {
        console.error('Could not save habit:', err);
        setError('Could not save that habit.');
      })
      .finally(() => setSaving(false));
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          label="Habit"
          value={name}
          onChangeText={setName}
          error={error}
          maxLength={MAX_NAME}
          autoFocus
          returnKeyType="done"
        />

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
                  <Text style={chipTextColor(selected)}>{option.label}</Text>
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
                    <Text style={chipTextColor(selected)}>{weekday.label}</Text>
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
                    <Text style={chipTextColor(selected)}>{String(count)}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <Button label={saving ? 'Saving…' : 'Save'} onPress={save} disabled={saving} />
      </ScrollView>
    </Screen>
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
});
