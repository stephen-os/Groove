import type { ImportProfile } from '../transfer';
import { getDatabase } from './client';
import { toCompletion, type Completion } from './completions';
import { toHabit, type Habit } from './habits';
import type { Profile } from './profiles';

// Whole-database read and replace, for backup and restore.
//
// It lives here rather than in any one table's module because a restore has to
// be a single transaction across all three: a failure part-way through must
// leave the existing data untouched rather than half-erased.

export interface GrooveData {
  profiles: readonly Profile[];
  habits: readonly Habit[];
  completions: readonly Completion[];
}

/**
 * Everything worth keeping, across every profile.
 *
 * Archived habits are included deliberately — they are what makes a year-old
 * completion in the analytics still have a name attached to it.
 *
 * `scheduled_notifs` is not here and never will be: those ids are handles into
 * this device's notification service, and mean nothing on the phone the backup
 * is restored onto.
 */
export async function exportData(): Promise<GrooveData> {
  const db = await getDatabase();

  const [profiles, habits, completions] = await Promise.all([
    db.getAllAsync<{ id: number; name: string; created_at: number }>(
      'SELECT id, name, created_at FROM profiles ORDER BY id'
    ),
    db.getAllAsync<Parameters<typeof toHabit>[0]>('SELECT * FROM habits ORDER BY id'),
    db.getAllAsync<Parameters<typeof toCompletion>[0]>('SELECT * FROM completions ORDER BY id'),
  ]);

  return {
    profiles: profiles.map((row) => ({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
    })),
    habits: habits.map(toHabit),
    completions: completions.map(toCompletion),
  };
}

/**
 * Replaces the entire database with the given data, preserving ids.
 *
 * Replace rather than merge: with device-local integer ids there is no sane way
 * to reconcile two histories, and a restore that silently duplicated six months
 * of completions would be worse than one that is explicit about overwriting.
 *
 * Deleting the profiles cascades to habits and completions, so the three tables
 * are cleared in the right order without saying so. The scheduled notifications
 * go too — they point at habits that no longer exist, and the caller reschedules
 * from scratch afterwards.
 *
 * Exclusive, not `withTransactionAsync`. That one is a bare BEGIN/COMMIT on the
 * app's single shared connection, so a second transaction starting while this
 * one runs fails on SQLite's "cannot start a transaction within a transaction"
 * — and expo-sqlite's handler answers by issuing ROLLBACK, which ends *this*
 * transaction, not the one that failed. Restoring a backup backgrounds the app
 * to pick the file, and returning fires a reminder resync that does exactly
 * that, half way through the restore.
 */
export async function replaceData(data: GrooveData): Promise<void> {
  const db = await getDatabase();

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync('DELETE FROM scheduled_notifs');
    await txn.execAsync('DELETE FROM profiles');

    for (const profile of data.profiles) {
      await txn.runAsync('INSERT INTO profiles (id, name, created_at) VALUES (?, ?, ?)', [
        profile.id,
        profile.name,
        profile.createdAt,
      ]);
    }

    for (const habit of data.habits) {
      await txn.runAsync(
        `INSERT INTO habits (
           id, profile_id, name, icon, color, schedule_kind,
           weekday_mask, target_count, due_time, remind_enabled, follow_ups,
           target_pct, starts_on, archived_at, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          habit.id,
          habit.profileId,
          habit.name,
          habit.icon,
          habit.color,
          habit.scheduleKind,
          habit.weekdayMask,
          habit.targetCount,
          habit.dueTime,
          habit.remindEnabled ? 1 : 0,
          habit.followUps,
          habit.targetPct,
          habit.startsOn,
          habit.archivedAt,
          habit.createdAt,
          habit.updatedAt,
        ]
      );
    }

    for (const completion of data.completions) {
      await txn.runAsync(
        'INSERT INTO completions (id, habit_id, day, status, done_at) VALUES (?, ?, ?, ?, ?)',
        [completion.id, completion.habitId, completion.day, completion.status, completion.doneAt]
      );
    }

    // The active profile almost certainly no longer exists. Point at the first
    // imported one so the app opens on something real.
    const active = data.profiles[0]?.id;
    if (active !== undefined) {
      await txn.runAsync(
        `INSERT INTO settings (key, value) VALUES ('activeProfileId', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [String(active)]
      );
    }
  });
}

export interface ImportSummary {
  profiles: number;
  habits: number;
  completions: number;
  /** What the first imported profile ended up called, after de-duplication. */
  name: string;
}

/**
 * Adds imported profiles alongside everything already here.
 *
 * The counterpart to `replaceData`, and the opposite promise: nothing existing
 * is touched. That is not a warning attached to a button, it is the shape of the
 * operation — an import creates profiles, so there is no existing profile for it
 * to land in and no merge to get wrong. A regretted import is undone by deleting
 * the profile it made.
 *
 * Ids are assigned by SQLite as it goes and carried down to the rows beneath,
 * which is why `planImport` hands over a nested plan with the file's own ids
 * already discarded: nothing here has to renumber anything.
 *
 * Names arrive final. Profile names are unique, and choosing a replacement for
 * one this device already uses is the importer's decision, not a suffix this
 * function invents — so a clash that reaches here is a bug or a race, and the
 * unique index answers it by aborting the whole transaction rather than letting
 * half a profile land.
 *
 * Exclusive for the same reason as `replaceData` — picking a file backgrounds
 * the app, and coming back fires a reminder resync that would otherwise start a
 * transaction inside this one.
 */
export async function importProfiles(plan: readonly ImportProfile[]): Promise<ImportSummary> {
  const db = await getDatabase();
  const summary: ImportSummary = { profiles: 0, habits: 0, completions: 0, name: '' };

  await db.withExclusiveTransactionAsync(async (txn) => {
    let firstId: number | null = null;

    for (const entry of plan) {
      const name = entry.name;
      const inserted = await txn.runAsync(
        'INSERT INTO profiles (name, created_at) VALUES (?, ?)',
        [name, entry.createdAt]
      );
      const profileId = inserted.lastInsertRowId;
      if (firstId === null) {
        firstId = profileId;
        summary.name = name;
      }
      summary.profiles += 1;

      for (const habit of entry.habits) {
        const habitRow = await txn.runAsync(
          `INSERT INTO habits (
             profile_id, name, icon, color, schedule_kind,
             weekday_mask, target_count, due_time, remind_enabled, follow_ups,
             target_pct, starts_on, archived_at, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            profileId,
            habit.name,
            habit.icon,
            habit.color,
            habit.scheduleKind,
            habit.weekdayMask,
            habit.targetCount,
            habit.dueTime,
            habit.remindEnabled ? 1 : 0,
            habit.followUps,
            habit.targetPct,
            habit.startsOn,
            habit.archivedAt,
            habit.createdAt,
            habit.updatedAt,
          ]
        );
        summary.habits += 1;

        for (const done of habit.completions) {
          await txn.runAsync(
            'INSERT INTO completions (habit_id, day, status, done_at) VALUES (?, ?, ?, ?)',
            [habitRow.lastInsertRowId, done.day, done.status, done.doneAt]
          );
          summary.completions += 1;
        }
      }
    }

    // Switch to what was just imported. You imported it to look at it, and
    // landing back on the old profile reads as nothing having happened.
    if (firstId !== null) {
      await txn.runAsync(
        `INSERT INTO settings (key, value) VALUES ('activeProfileId', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [String(firstId)]
      );
    }
  });

  return summary;
}
