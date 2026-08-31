import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { DEMO_PROFILE, demoProfileExists, seedDemoData } from '@/lib/db/seed';
import { syncReminders } from '@/lib/reminders';
import { spacing } from '@/lib/theme';

/**
 * Ninety days of invented history, in a profile of its own.
 *
 * Nothing here is destructive, so nothing here asks twice. It used to replace
 * every habit in the profile you were standing in, which made "demo data" one
 * of the most dangerous buttons on the screen; now it adds a profile you can
 * look at and delete like any other, and the button greys out while it exists.
 */
export function DemoCard({ onFinished }: { onFinished: () => void }) {
  const [exists, setExists] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Re-read on focus rather than once. Deleting the demo profile happens in the
  // card above this one, and a schema change rebuilds the database and takes
  // the profile with it — both have to re-enable the button.
  useFocusEffect(
    useCallback(() => {
      demoProfileExists()
        .then(setExists)
        .catch((error: unknown) => console.warn('Could not check for demo data:', error));
    }, [])
  );

  const enable = (): void => {
    setBusy(true);
    setStatus(null);
    seedDemoData()
      .then(async (result) => {
        // The demo habits are never armed, but switching profiles changes what
        // is due, so what the OS has pending is no longer right.
        await syncReminders();
        setExists(true);
        setStatus(`Added ${result.habits} habits and ${result.completions} days to "${DEMO_PROFILE}".`);
        onFinished();
      })
      .catch((error: unknown) => {
        console.error('Could not enable demo data:', error);
        setStatus('Could not add the demo profile.');
      })
      .finally(() => setBusy(false));
  };

  return (
    <Card>
      <Text variant="heading">Demo profile</Text>
      <Text tone="muted">
        Nine habits and a worked ninety-day history, so the calendar and the analytics
        have something to show. It arrives as a separate profile called &ldquo;
        {DEMO_PROFILE}&rdquo; and touches nothing you have — switch away from it whenever
        you like, and delete it as you would any other profile. Its reminders are never
        armed, so nothing invented will ever notify you.
      </Text>

      <View style={styles.actions}>
        <Button
          label={exists ? 'Demo profile added' : 'Enable demo profile'}
          tone="secondary"
          onPress={enable}
          disabled={busy || exists}
          accessibilityHint={
            exists
              ? 'Already added. Delete the Demo profile to add it again'
              : 'Creates a separate profile holding ninety days of made-up history'
          }
        />
      </View>

      {status !== null && (
        <Text tone="muted" accessibilityLiveRegion="polite">
          {status}
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
