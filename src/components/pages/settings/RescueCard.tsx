import { useCallback, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { shareRescue } from '@/lib/backup-file';
import { deleteRescue, listRescues } from '@/lib/db/rescue';
import { spacing } from '@/lib/theme';

/**
 * The backups the app took of itself before rebuilding its own database.
 *
 * Invisible unless one exists, which is nearly always — it is a card that
 * appears the one time it matters and never occupies the screen otherwise.
 * Sharing is the only way these leave the app's private storage, and getting
 * one out is the whole point of having written it.
 */
export function RescueCard() {
  const [files, setFiles] = useState<{ name: string; uri: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback((): void => {
    try {
      setFiles(listRescues());
    } catch (error) {
      console.warn('Could not list rescue backups:', error);
    }
  }, []);

  useFocusEffect(load);

  if (files.length === 0) return null;

  const confirmDelete = (name: string): void => {
    Alert.alert(
      'Delete this rescue backup?',
      'It is the only copy of what the app held before its database was rebuilt. Share it somewhere first if you have not already.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteRescue(name);
            load();
          },
        },
      ]
    );
  };

  return (
    <Card>
      <Text variant="heading">Rescue backups</Text>
      <Text tone="muted">
        A change to the app rebuilt its database from scratch. This is everything it held
        immediately beforehand, saved automatically. Share it somewhere safe, then bring it
        back with &ldquo;Restore from backup&rdquo; at the bottom of this screen.
      </Text>

      {files.map((file) => (
        <View key={file.name} style={styles.entry}>
          <Text variant="caption" tone="muted">
            {file.name}
          </Text>
          <View style={styles.actions}>
            <Button
              label="Share"
              onPress={() => {
                setBusy(true);
                shareRescue(file.uri)
                  .catch((error: unknown) => console.error('Share failed:', error))
                  .finally(() => setBusy(false));
              }}
              disabled={busy}
              style={styles.action}
            />
            <Button
              label="Delete"
              tone="secondary"
              onPress={() => confirmDelete(file.name)}
              disabled={busy}
              style={styles.action}
            />
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  entry: { gap: spacing.xs, marginTop: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flexGrow: 1, flexBasis: 'auto' },
});
