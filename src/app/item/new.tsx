import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/components/layout/ThemeProvider';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { createItem } from '@/lib/db/items';
import { scheduleReminder } from '@/lib/notifications';
import { MIN_TOUCH_TARGET, radius, spacing } from '@/lib/theme';

// Keep in step with the bounds in lib/backup.ts, or an item can be saved that a
// backup of itself would then reject as invalid.
const MAX_TITLE = 200;
const MAX_BODY = 10_000;

// Offsets in minutes. Preset chips rather than a date picker on purpose: a real
// picker means another native dependency, and for the reminders a personal app
// actually uses, "later today" and "tomorrow" cover most of it. Swap in
// @react-native-community/datetimepicker when a project needs exact times.
const REMINDER_OPTIONS: readonly { label: string; minutes: number | null }[] = [
  { label: 'None', minutes: null },
  { label: 'In 1 hour', minutes: 60 },
  { label: 'Tomorrow', minutes: 60 * 24 },
];

export default function NewItemScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);

  const save = (): void => {
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      setError('A title is required.');
      return;
    }
    if (trimmed.length > MAX_TITLE) {
      setError(`Keep the title under ${MAX_TITLE} characters.`);
      return;
    }
    setError(undefined);
    setSaving(true);

    const persist = async (): Promise<void> => {
      const remindAt =
        reminderMinutes === null ? null : Date.now() + reminderMinutes * 60 * 1000;

      // Schedule before inserting so the notification id can be stored with the
      // item. A null id here just means no reminder — scheduleReminder never
      // throws, so a denied permission cannot cost the user their item.
      const notificationId =
        remindAt === null
          ? null
          : await scheduleReminder(trimmed, body.slice(0, 100), new Date(remindAt));

      await createItem({
        title: trimmed,
        body: body.slice(0, MAX_BODY),
        // If scheduling failed, don't claim a reminder the OS will never fire.
        remindAt: notificationId === null ? null : remindAt,
        notificationId,
      });

      if (remindAt !== null && notificationId === null) {
        Alert.alert('Saved without a reminder', 'Notifications are turned off for this app.');
      }
      router.back();
    };

    persist()
      .catch((err: unknown) => {
        console.error('Could not save item:', err);
        setError('Could not save that item.');
      })
      .finally(() => setSaving(false));
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          label="Title"
          value={title}
          onChangeText={setTitle}
          error={error}
          maxLength={MAX_TITLE}
          autoFocus
          returnKeyType="next"
        />

        <TextField
          label="Notes"
          value={body}
          onChangeText={setBody}
          maxLength={MAX_BODY}
          multiline
        />

        <View style={styles.group} accessibilityRole="radiogroup">
          <Text variant="caption" tone="muted">
            Reminder
          </Text>
          <View style={styles.chips}>
            {REMINDER_OPTIONS.map((option) => {
              const selected = reminderMinutes === option.minutes;
              return (
                <Pressable
                  key={option.label}
                  onPress={() => setReminderMinutes(option.minutes)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? theme.accent : 'transparent',
                      borderColor: selected ? theme.accent : theme.borderStrong,
                    },
                  ]}
                >
                  <Text style={{ color: selected ? theme.onAccent : theme.fg }}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

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
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
