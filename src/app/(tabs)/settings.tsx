import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { AccentPicker } from '@/components/pages/settings/AccentPicker';
import { DemoCard } from '@/components/pages/settings/DemoCard';
import { ProfilePicker } from '@/components/pages/settings/ProfilePicker';
import { RescueCard } from '@/components/pages/settings/RescueCard';
import { TransferCard } from '@/components/pages/settings/TransferCard';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { exportBackup, importBackup } from '@/lib/backup-file';
import { eraseAllData, getActiveProfileId, resetProfile } from '@/lib/db/profiles';
import { syncReminders } from '@/lib/reminders';
import { GUTTER, spacing } from '@/lib/theme';

/** The cards that can report an outcome, so it appears beside its own button. */
type StatusCard = 'backup' | 'startOver';

export default function SettingsScreen() {
  // Which card the outcome belongs to, as well as what it said. A single line
  // rendered in one fixed place put the result of "Erase all data" inside the
  // Backup card, several hundred pixels above the button that was pressed and
  // usually off the screen entirely — announced to a screen reader, invisible
  // to everyone else.
  const [status, setStatus] = useState<{ card: StatusCard; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // Remounts the profile card after anything on this screen finishes. Importing,
  // restoring and erasing all change which profiles exist, and all three happen
  // without ever leaving this route — so nothing else would tell the card to
  // look again.
  const [reload, setReload] = useState(0);

  const run = useCallback(
    (card: StatusCard, action: () => Promise<{ ok: boolean; message: string }>): void => {
      setBusy(true);
      setStatus(null);
      action()
        .then(async (result) => {
          // Whatever just happened may have replaced every habit on the device,
          // so what the OS has pending is no longer trustworthy.
          await syncReminders();
          setStatus({ card, message: result.message });
          setReload((n) => n + 1);
        })
        .catch((error: unknown) => {
          console.error('Settings action failed:', error);
          setStatus({ card, message: 'Something went wrong.' });
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
        { text: 'Replace', style: 'destructive', onPress: () => run('startOver', importBackup) },
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
            run('startOver', async () => {
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
            run('startOver', async () => {
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
          <Text variant="caption" tone="muted">
            CURRENT PROFILE
          </Text>
          <ProfilePicker key={reload} onChanged={() => setStatus(null)} />
          <Text variant="caption" tone="muted" style={styles.note}>
            Profiles are separate habit lists sharing this device — personal and work, say.
            One is active at a time, and every other screen follows it.
          </Text>
        </Card>

        <Card>
          <Text variant="heading">Highlight colour</Text>
          <Text tone="muted">
            The colour used for anything active — a ticked habit, the chosen day, the line
            on a chart. Everything else stays the same dark grey.
          </Text>
          <AccentPicker />
        </Card>

        {/* Only rendered when the app has rebuilt its own database and saved
            what it held first. Placed high: it is the most time-sensitive thing
            on the screen the one time it appears. */}
        <RescueCard />

        <TransferCard
          onFinished={() => {
            // An import creates a profile and switches to it, so the card above
            // has to look again.
            setStatus(null);
            setReload((n) => n + 1);
          }}
        />

        <Card>
          <Text variant="heading">Backup</Text>
          <Text tone="muted">
            Everything lives on this device only. Android&apos;s own app backup is turned
            off for Groove, so nothing is copied to your Google account either — which
            also means a lost or wiped phone loses the data. Export a backup somewhere
            safe: it carries every profile at once, where the exports above carry one.
            Putting one back is &ldquo;Restore&rdquo;, at the bottom of this screen.
          </Text>

          <View style={styles.actions}>
            <Button
              label="Export backup"
              tone="secondary"
              onPress={() => run('backup', exportBackup)}
              disabled={busy}
              accessibilityHint="Writes every profile, habit and completed day to a JSON file and opens the share sheet"
            />
          </View>

          {status?.card === 'backup' && (
            // role="status" equivalent: announces the outcome without stealing focus.
            <Text tone="muted" accessibilityLiveRegion="polite">
              {status.message}
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

        <DemoCard
          onFinished={() => {
            setStatus(null);
            setReload((n) => n + 1);
          }}
        />

        <Card>
          <Text variant="heading">Start over</Text>
          <Text tone="muted">
            None of these can be undone, and none of them touches a file you have already
            exported. Restore is here rather than beside the other exports because it is
            the one import that destroys things: it replaces every profile on the device,
            where importing a profile only ever adds one.
          </Text>
          <View style={styles.actions}>
            <Button
              label="Restore from backup"
              tone="secondary"
              onPress={confirmImport}
              disabled={busy}
              accessibilityHint="Replaces every profile, habit and completed day with the contents of a backup file"
            />
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

          {status?.card === 'startOver' && (
            <Text tone="muted" accessibilityLiveRegion="polite">
              {status.message}
            </Text>
          )}
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, gap: spacing.md, paddingVertical: spacing.md },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  note: { marginTop: spacing.sm },
});
