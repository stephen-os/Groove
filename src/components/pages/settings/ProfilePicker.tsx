import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { TextField } from '@/components/ui/TextField';
import {
  createProfile,
  deleteProfile,
  getActiveProfileId,
  listProfiles,
  renameProfile,
  setActiveProfile,
  type Profile,
} from '@/lib/db/profiles';
import { syncReminders } from '@/lib/reminders';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '@/lib/theme';

// Switching between separate habit lists — personal and work — without any
// notion of an account. Keep in step with the bound in lib/backup.ts.
const MAX_NAME = 200;

type Editing = { mode: 'none' } | { mode: 'new' } | { mode: 'rename'; id: number };

export function ProfilePicker({ onChanged }: { onChanged: () => void }) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Editing>({ mode: 'none' });
  const [draft, setDraft] = useState('');

  const load = useCallback(async (): Promise<void> => {
    const [all, active] = await Promise.all([listProfiles(), getActiveProfileId()]);
    setProfiles(all);
    setActiveId(active);
  }, []);

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
          setEditing({ mode: 'none' });
          setDraft('');
        })
        .catch((error: unknown) => {
          console.error(failure, error);
          Alert.alert(failure);
        });
    },
    [load, onChanged]
  );

  const submitDraft = (): void => {
    const name = draft.trim();
    if (name.length === 0) return;
    if (editing.mode === 'new') {
      apply(createProfile(name), 'Could not create that profile.');
    } else if (editing.mode === 'rename') {
      apply(renameProfile(editing.id, name), 'Could not rename that profile.');
    }
  };

  const confirmDelete = (profile: Profile): void => {
    if (profiles.length <= 1) {
      Alert.alert(
        'That is the only profile',
        'There has to be one. Use "Erase all data" below to start over.'
      );
      return;
    }
    Alert.alert(
      `Delete "${profile.name}"?`,
      'Every habit in this profile and its whole history go with it. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => apply(deleteProfile(profile.id), 'Could not delete that profile.'),
        },
      ]
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {profiles.map((profile) => {
          const selected = profile.id === activeId;
          return (
            <Pressable
              key={profile.id}
              onPress={() => apply(setActiveProfile(profile.id), 'Could not switch profile.')}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              style={[styles.chip, selected ? styles.chipOn : styles.chipOff]}
            >
              <Text style={selected ? styles.chipTextOn : styles.chipTextOff}>{profile.name}</Text>
            </Pressable>
          );
        })}
      </View>

      {editing.mode === 'none' ? (
        <View style={styles.actions}>
          <Button
            label="New profile"
            tone="secondary"
            onPress={() => {
              setDraft('');
              setEditing({ mode: 'new' });
            }}
            style={styles.action}
          />
          {activeId !== null && (
            <Button
              label="Rename"
              tone="secondary"
              onPress={() => {
                setDraft(profiles.find((profile) => profile.id === activeId)?.name ?? '');
                setEditing({ mode: 'rename', id: activeId });
              }}
              style={styles.action}
            />
          )}
        </View>
      ) : (
        <View style={styles.editor}>
          <TextField
            label={editing.mode === 'new' ? 'New profile name' : 'Rename profile'}
            value={draft}
            onChangeText={setDraft}
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
              onPress={() => setEditing({ mode: 'none' })}
              style={styles.action}
            />
          </View>
        </View>
      )}

      {activeId !== null && profiles.length > 1 && (
        <Button
          label="Delete this profile"
          tone="danger"
          onPress={() => {
            const active = profiles.find((profile) => profile.id === activeId);
            if (active) confirmDelete(active);
          }}
          accessibilityHint="Removes this profile and every habit in it"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm, marginTop: spacing.sm },
  chips: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipOff: { backgroundColor: 'transparent', borderColor: colors.borderStrong },
  chipTextOn: { color: colors.onAccent },
  chipTextOff: { color: colors.fg },
  editor: { gap: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  action: { flex: 1 },
});
