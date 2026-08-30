import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { ThemePicker } from '@/components/pages/settings/ThemePicker';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { exportBackup, importBackup } from '@/lib/backup-file';
import { spacing } from '@/lib/theme';

export default function SettingsScreen() {
  // A single status line, announced when it changes. Screen readers otherwise
  // miss the result of a backup entirely — the visible text just appears.
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = (action: () => Promise<{ ok: boolean; message: string }>): void => {
    setBusy(true);
    setStatus(null);
    action()
      .then((result) => setStatus(result.message))
      .catch((error: unknown) => {
        console.error('Backup action failed:', error);
        setStatus('Something went wrong.');
      })
      .finally(() => setBusy(false));
  };

  const confirmImport = (): void => {
    Alert.alert(
      'Restore from backup?',
      'This replaces every item currently in the app with the contents of the backup file. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Replace', style: 'destructive', onPress: () => run(importBackup) },
      ]
    );
  };

  return (
    <Screen edgeToEdgeBottom>
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text variant="heading">Appearance</Text>
          <Text tone="muted">System follows your device&apos;s light or dark setting.</Text>
          <View style={styles.spacer}>
            <ThemePicker />
          </View>
        </Card>

        <Card>
          <Text variant="heading">Backup</Text>
          <Text tone="muted">
            Everything lives on this device only. Nothing is uploaded anywhere, which also
            means a lost or wiped phone loses the data — export a backup somewhere safe.
          </Text>

          <View style={styles.actions}>
            <Button
              label="Export backup"
              onPress={() => run(exportBackup)}
              disabled={busy}
              accessibilityHint="Writes all items to a JSON file and opens the share sheet"
            />
            <Button
              label="Restore from backup"
              tone="secondary"
              onPress={confirmImport}
              disabled={busy}
              accessibilityHint="Replaces all items with the contents of a backup file"
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
            notification permission, Android will not ask again — turn it back on in
            system settings for this app.
          </Text>
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingVertical: spacing.md },
  spacer: { marginTop: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
