import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { ProfilePicker } from '@/components/pages/settings/ProfilePicker';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { exportBackup, importBackup } from '@/lib/backup-file';
import { eraseAllData, getActiveProfileId, resetProfile } from '@/lib/db/profiles';
import { syncReminders } from '@/lib/reminders';
import { spacing } from '@/lib/theme';

export default function SettingsScreen() {
  // A single status line, announced when it changes. Screen readers otherwise
  // miss the result of a backup entirely — the visible text just appears.
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(
    (action: () => Promise<{ ok: boolean; message: string }>): void => {
      setBusy(true);
      setStatus(null);
      action()
        .then(async (result) => {
          // Whatever just happened may have replaced every habit on the device,
          // so what the OS has pending is no longer trustworthy.
          await syncReminders();
          setStatus(result.message);
        })
        .catch((error: unknown) => {
          console.error('Settings action failed:', error);
          setStatus('Something went wrong.');
        })
        .finally(() => setBusy(false));
    },
    []
  );

  const confirmImport = (): void => {
    Alert.alert(
      'Restore from backup?',
      'This replaces every profile, habit and completed day in the app with the contents of the backup file. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: () => run(importBackup) },
      ]
    );
  };

  const confirmReset = (): void => {
    Alert.alert(
      'Reset this profile?',
      'Every habit in the current profile and its whole history are erased. The profile itself stays. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () =>
            run(async () => {
              const profileId = await getActiveProfileId();
              await resetProfile(profileId);
              return { ok: true, message: 'Profile reset.' };
            }),
        },
      ]
    );
  };

  const confirmErase = (): void => {
    Alert.alert(
      'Erase all data?',
      'Every profile, habit and completed day on this device is destroyed, leaving one empty profile. Export a backup first if you might want any of it back.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Erase everything',
          style: 'destructive',
          onPress: () =>
            run(async () => {
              await eraseAllData();
              return { ok: true, message: 'All data erased.' };
            }),
        },
      ]
    );
  };

  return (
    <Screen edgeToEdgeBottom>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text variant="heading">Profile</Text>
          <Text tone="muted">
            Separate habit lists that share this device — personal and work, say. One is
            active at a time, and everything else in the app follows it.
          </Text>
          <ProfilePicker onChanged={() => setStatus(null)} />
        </Card>

        <Card>
          <Text variant="heading">Backup</Text>
          <Text tone="muted">
            Everything lives on this device only. Nothing is uploaded anywhere, which also
            means a lost or wiped phone loses the data — export a backup somewhere safe.
            The file carries every profile, so it moves the whole app to another phone.
          </Text>

          <View style={styles.actions}>
            <Button
              label="Export backup"
              onPress={() => run(exportBackup)}
              disabled={busy}
              accessibilityHint="Writes every habit and completed day to a JSON file and opens the share sheet"
            />
            <Button
              label="Restore from backup"
              tone="secondary"
              onPress={confirmImport}
              disabled={busy}
              accessibilityHint="Replaces all data with the contents of a backup file"
            />
          </View>

          {status !== null && (
            // role="status" equivalent: announces the outcome without stealing focus.
            <Text tone="muted" accessibilityLiveRegion="polite">
              {status}
            </Text>
          )}
        </Card>

        <Card>
          <Text variant="heading">Reminders</Text>
          <Text tone="muted">
            Reminders are scheduled on this device and never leave it. If you declined the
            notification permission, Android will not ask again — turn it back on in system
            settings for this app. Alerts are placed a week ahead and refilled whenever you
            open Groove, so opening it occasionally is what keeps them coming.
          </Text>
        </Card>

        <Card>
          <Text variant="heading">Start over</Text>
          <Text tone="muted">
            Neither of these can be undone, and neither touches a backup file you have
            already exported.
          </Text>
          <View style={styles.actions}>
            <Button
              label="Reset this profile"
              tone="secondary"
              onPress={confirmReset}
              disabled={busy}
              accessibilityHint="Erases every habit and all history in the current profile"
            />
            <Button
              label="Erase all data"
              tone="danger"
              onPress={confirmErase}
              disabled={busy}
              accessibilityHint="Destroys every profile, habit and completed day on this device"
            />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingVertical: spacing.md },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
