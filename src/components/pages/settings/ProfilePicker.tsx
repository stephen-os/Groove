import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import { useAccent } from '@/hooks/useAccent';
import {
  createProfile,
  deleteProfile,
  getActiveProfileId,
  listProfileSummaries,
  renameProfile,
  setActiveProfile,
  type ProfileSummary,
} from '@/lib/db/profiles';
import { syncReminders } from '@/lib/reminders';
import { isNameTaken } from '@/lib/transfer';
import { bevelSunken, colors, MIN_TOUCH_TARGET, radius, spacing } from '@/lib/theme';

// Switching between separate habit lists — personal and work — without any
// notion of an account. Keep in step with the bound in lib/backup.ts.
const MAX_NAME = 200;

type Mode = 'idle' | 'switch' | 'new' | 'rename';

/** "9 habits · 412 days tracked", or the honest version when there is nothing. */
function describe(profile: ProfileSummary): string {
  if (profile.habitCount === 0 && profile.completionCount === 0) return 'Empty';
  const habits = `${profile.habitCount} habit${profile.habitCount === 1 ? '' : 's'}`;
  if (profile.completionCount === 0) return habits;
  return `${habits} · ${profile.completionCount} day${profile.completionCount === 1 ? '' : 's'} tracked`;
}

export function ProfilePicker({ onChanged }: { onChanged: () => void }) {
  const accent = useAccent();
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>('idle');
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | undefined>(undefined);

  const load = useCallback(async (): Promise<void> => {
    const [all, active] = await Promise.all([listProfileSummaries(), getActiveProfileId()]);
    setProfiles(all);
    setActiveId(active);
  }, []);

  // Focus is not enough on its own. Importing changes which profiles exist and
  // never leaves this route — picking a file hands off to a separate activity
  // and comes back to the same screen, which is not a focus change — so the card
  // would go stale exactly when it mattered, reporting a successful import above
  // a heading still naming the old profile. The screen remounts this card after
  // anything it does, which reloads it and returns it to its resting state.
  useFocusEffect(
    useCallback(() => {
      load().catch((error: unknown) => console.error('Could not load profiles:', error));
    }, [load])
  );

  /** Every change here changes which habits exist, so the alerts must follow. */
  const apply = useCallback(
    (action: Promise<unknown>, failure: string): void => {
      action
        .then(syncReminders)
        .then(load)
        .then(onChanged)
        .then(() => {
          setMode('idle');
          setDraft('');
          setDraftError(undefined);
        })
        .catch((error: unknown) => {
          console.error(failure, error);
          Alert.alert(failure);
        });
    },
    [load, onChanged]
  );

  const active = profiles.find((profile) => profile.id === activeId) ?? null;

  const submitDraft = (): void => {
    const name = draft.trim();
    if (name.length === 0) {
      setDraftError('A name is required.');
      return;
    }

    // Names are unique, and the database enforces it — but a constraint failure
    // surfaces as "could not rename that profile", which says nothing about
    // what to do next. Checking here turns it into an answerable question.
    // Renaming compares against everything except the profile being renamed, so
    // correcting the case of its own name is allowed.
    const others = profiles
      .filter((profile) => mode === 'new' || profile.id !== activeId)
      .map((profile) => profile.name);
    if (isNameTaken(name, others)) {
      setDraftError('That name is already used.');
      return;
    }

    setDraftError(undefined);
    if (mode === 'new') apply(createProfile(name), 'Could not create that profile.');
    else if (mode === 'rename' && activeId !== null) {
      apply(renameProfile(activeId, name), 'Could not rename that profile.');
    }
  };

  const confirmDelete = (): void => {
    if (!active) return;
    Alert.alert(
      `Delete "${active.name}"?`,
      `Every habit in this profile and its whole history go with it — ${describe(active).toLowerCase()}. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => apply(deleteProfile(active.id), 'Could not delete that profile.'),
        },
      ]
    );
  };

  return (
    <View style={styles.root}>
      {/* The profile you are on, said plainly and first. Everything else in
          Settings acts on it, and until now nothing on the screen said which
          one it was. */}
      <Text variant="title">{active?.name ?? '…'}</Text>
      <Text variant="caption" tone="muted">
        {active ? describe(active) : ' '}
      </Text>

      {mode === 'switch' && (
        <View style={styles.list} accessibilityRole="radiogroup">
          {profiles.map((profile) => {
            const selected = profile.id === activeId;
            return (
              <Pressable
                key={profile.id}
                onPress={() =>
                  selected
                    ? setMode('idle')
                    : apply(setActiveProfile(profile.id), 'Could not switch profile.')
                }
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={profile.name}
                accessibilityHint={describe(profile)}
                style={[styles.row, selected ? { borderColor: accent.base } : null]}
              >
                <View style={styles.rowLabels}>
                  <Text>{profile.name}</Text>
                  <Text variant="caption" tone="muted">
                    {describe(profile)}
                  </Text>
                </View>
                {/* Decorative: the radio role already announces which is chosen. */}
                {selected && <Ionicons name="checkmark" size={20} color={accent.base} />}
              </Pressable>
            );
          })}
        </View>
      )}

      {(mode === 'new' || mode === 'rename') && (
        <View style={styles.editor}>
          <TextField
            label={mode === 'new' ? 'New profile name' : 'Rename this profile'}
            value={draft}
            onChangeText={(value) => {
              setDraft(value);
              setDraftError(undefined);
            }}
            error={draftError}
            maxLength={MAX_NAME}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submitDraft}
          />
          <View style={styles.actions}>
            <Button label="Save" onPress={submitDraft} style={styles.action} />
            <Button
              label="Cancel"
              tone="secondary"
              onPress={() => setMode('idle')}
              style={styles.action}
            />
          </View>
        </View>
      )}

      {mode !== 'new' && mode !== 'rename' && (
        <View style={styles.actions}>
          {profiles.length > 1 && (
            <Button
              label={mode === 'switch' ? 'Close' : 'Switch'}
              tone="secondary"
              onPress={() => setMode(mode === 'switch' ? 'idle' : 'switch')}
              accessibilityHint="Lists the profiles on this device"
              style={styles.action}
            />
          )}
          <Button
            label="New"
            tone="secondary"
            onPress={() => {
              setDraft('');
              setDraftError(undefined);
              setMode('new');
            }}
            accessibilityHint="Creates an empty profile and switches to it"
            style={styles.action}
          />
          <Button
            label="Rename"
            tone="secondary"
            onPress={() => {
              setDraft(active?.name ?? '');
              setDraftError(undefined);
              setMode('rename');
            }}
            style={styles.action}
          />
        </View>
      )}

      {/* Hidden rather than disabled when it is the only one. There is nothing
          to explain and nothing to press — "Erase all data" is the operation
          that means what deleting the last profile would. */}
      {profiles.length > 1 && mode === 'idle' && (
        <Button
          label="Delete this profile"
          tone="danger"
          onPress={confirmDelete}
          accessibilityHint="Removes this profile and every habit in it"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs, marginTop: spacing.sm },
  list: { gap: spacing.sm, marginTop: spacing.sm },
  row: {
    ...bevelSunken,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    backgroundColor: colors.bgAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderColor: colors.borderStrong,
  },
  rowLabels: { flex: 1, gap: 2 },
  editor: { gap: spacing.sm, marginTop: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  // Grow to fill the row, but never below the width of the label. Equal thirds
  // left "Rename" 50dp of the 62 it needs and broke it across two lines, which
  // made that one button taller than the two beside it.
  action: { flexGrow: 1, flexBasis: 'auto' },
});
