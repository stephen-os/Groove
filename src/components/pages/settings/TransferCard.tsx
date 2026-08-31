import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import {
  commitImport,
  exportHabits,
  exportProfile,
  readImportFile,
  type BackupOutcome,
} from '@/lib/backup-file';
import type { GrooveData } from '@/lib/db/data';
import { syncReminders } from '@/lib/reminders';
import { isNameTaken } from '@/lib/transfer';
import { spacing } from '@/lib/theme';

// Keep in step with the bound in lib/backup.ts.
const MAX_NAME = 200;

/** A file that has been read and validated but is waiting on a name. */
interface Pending {
  data: GrooveData;
  clashes: { id: number; name: string }[];
  taken: string[];
  /** The replacement typed for each clashing profile, keyed by its id in the file. */
  chosen: Record<number, string>;
}

/**
 * Moving habits between phones.
 *
 * Import creates profiles and never writes into an existing one, so bringing a
 * file in cannot disturb what is already here. The one thing it cannot decide
 * on its own is a name: profile names are unique, and a file naming a profile
 * this device already has needs an answer rather than a suffix. Inventing one
 * put "Personal" directly above "Personal (imported)" in the switcher, which is
 * the confusion the uniqueness rule exists to prevent — so the question is
 * asked, and only asked when there is a real clash.
 */
export function TransferCard({ onFinished }: { onFinished: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const run = (action: () => Promise<BackupOutcome>): void => {
    setBusy(true);
    setStatus(null);
    action()
      .then(async (outcome) => {
        // An import brings habits with due times, so what the OS has pending is
        // no longer the whole picture.
        await syncReminders();
        setStatus(outcome.message);
        onFinished(outcome.message);
      })
      .catch((error: unknown) => {
        console.error('Transfer failed:', error);
        setStatus('Something went wrong.');
      })
      .finally(() => setBusy(false));
  };

  const startImport = (): void => {
    setBusy(true);
    setStatus(null);
    readImportFile()
      .then((file) => {
        if (!file.ok) {
          setStatus(file.message);
          return;
        }
        if (file.clashes.length === 0) {
          // Nothing to settle, so nothing to ask. This is the ordinary case —
          // a file arriving on a phone that has never heard of it.
          return run(() => commitImport(file.data, new Map()));
        }
        setPending({
          data: file.data,
          clashes: file.clashes,
          taken: file.taken,
          chosen: Object.fromEntries(file.clashes.map((clash) => [clash.id, clash.name])),
        });
      })
      .catch((error: unknown) => {
        console.error('Import failed:', error);
        setStatus('Could not read that file.');
      })
      .finally(() => setBusy(false));
  };

  /** Why this name will not do, or undefined if it will. */
  const nameError = (id: number, value: string): string | undefined => {
    const name = value.trim();
    if (name.length === 0) return 'A name is required.';
    if (isNameTaken(name, pending?.taken ?? [])) return 'That name is already used.';
    // The other answers on this form count too — two clashes resolved to the
    // same new name would fail on the unique index after the first one landed.
    const others = Object.entries(pending?.chosen ?? {})
      .filter(([key]) => Number(key) !== id)
      .map(([, other]) => other.trim());
    if (isNameTaken(name, others)) return 'That name is used by another profile in this file.';
    return undefined;
  };

  const errors =
    pending === null
      ? []
      : pending.clashes.map((clash) => nameError(clash.id, pending.chosen[clash.id] ?? ''));

  const confirmNames = (): void => {
    if (pending === null || errors.some((error) => error !== undefined)) return;
    const names = new Map(
      Object.entries(pending.chosen).map(([id, name]) => [Number(id), name.trim()])
    );
    const data = pending.data;
    setPending(null);
    run(() => commitImport(data, names));
  };

  if (pending !== null) {
    return (
      <Card>
        <Text variant="heading">Name the imported profile</Text>
        <Text tone="muted">
          {pending.clashes.length === 1
            ? `This phone already has a profile called "${pending.clashes[0].name}". Two profiles cannot share a name, so give this one a different one.`
            : `This phone already uses ${pending.clashes.length} of the names in that file. Two profiles cannot share a name, so give each of these a different one.`}
        </Text>

        {pending.clashes.map((clash, index) => (
          <TextField
            key={clash.id}
            label={`Was "${clash.name}"`}
            value={pending.chosen[clash.id] ?? ''}
            onChangeText={(value) =>
              setPending((current) =>
                current === null
                  ? current
                  : { ...current, chosen: { ...current.chosen, [clash.id]: value } }
              )
            }
            error={errors[index]}
            maxLength={MAX_NAME}
            autoFocus={index === 0}
            returnKeyType="done"
          />
        ))}

        <View style={styles.actions}>
          <Button
            label="Import"
            onPress={confirmNames}
            disabled={errors.some((error) => error !== undefined)}
          />
          {/* Nothing has been written yet, so cancelling costs only the pick. */}
          <Button label="Cancel" tone="secondary" onPress={() => setPending(null)} />
        </View>
      </Card>
    );
  }

  return (
    <Card>
      <Text variant="heading">Move habits between phones</Text>
      <Text tone="muted">
        Export writes this profile to a file you can send anywhere. Import always creates a
        new profile — it never adds to the one you are on, so bringing a file in cannot
        disturb what is already here, and deleting the profile it makes undoes it completely.
      </Text>

      <View style={styles.actions}>
        <Button
          label="Export habits"
          tone="secondary"
          onPress={() => run(exportHabits)}
          disabled={busy}
          accessibilityHint="Writes this profile's habits with no history, ready to set up another phone"
        />
        <Button
          label="Export habits and history"
          tone="secondary"
          onPress={() => run(exportProfile)}
          disabled={busy}
          accessibilityHint="Writes this profile's habits together with every day recorded against them"
        />
        <Button
          label="Import as a new profile"
          onPress={startImport}
          disabled={busy}
          accessibilityHint="Reads a Groove file into a new profile, leaving every existing profile untouched"
        />
      </View>

      {status !== null && (
        // role="status" equivalent: announces the outcome without stealing focus.
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
