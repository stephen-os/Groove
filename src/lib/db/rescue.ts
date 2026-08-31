import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { backupFilename, serializeBackup } from '../backup';
import type { GrooveData } from './data';

// The last thing that happens before the database is thrown away.
//
// A schema change rebuilds the database from scratch (see client.ts), which is
// the right trade while the app is being built and a catastrophe the day it is
// being used: months of history would go, silently, before the first screen
// painted. This writes it out first, so a rebuild costs a restore rather than
// the data.
//
// Rescue files go to `Paths.document`, not the cache the Settings export uses.
// A shared export has served its purpose the moment it reaches Drive and the OS
// is welcome to reclaim it; this one has not been seen by anyone yet and has to
// still be there whenever its owner comes looking.

/** Where rescue files live, under the app's document directory. */
const FOLDER = 'rescue';

/**
 * Reads the tables without going through the typed row mappers.
 *
 * Deliberately not `exportData`. This runs precisely when the database does not
 * match the code — that is the only reason it runs at all — so the current
 * mappers are the wrong tool: they name columns this database may not have and
 * assume a shape it may not be in. Every field is read defensively and filled
 * from the schema's own defaults, because a rescue file missing one field is
 * worth immeasurably more than an exception thrown while trying to save it.
 */
async function readDefensively(db: SQLiteDatabase): Promise<GrooveData> {
  const rows = async (table: string): Promise<Record<string, unknown>[]> => {
    try {
      return await db.getAllAsync<Record<string, unknown>>(`SELECT * FROM ${table}`);
    } catch {
      // A table the old schema did not have, or had under another name. The
      // other two are still worth saving.
      return [];
    }
  };

  const num = (value: unknown, fallback: number): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const str = (value: unknown, fallback: string): string =>
    typeof value === 'string' ? value : fallback;

  const [profileRows, habitRows, completionRows] = await Promise.all([
    rows('profiles'),
    rows('habits'),
    rows('completions'),
  ]);

  const now = Date.now();

  return restorable({
    profiles: profileRows.map((row, index) => ({
      id: num(row.id, index + 1),
      name: str(row.name, `Profile ${index + 1}`),
      createdAt: num(row.created_at, now),
    })),
    habits: habitRows.map((row, index) => ({
      id: num(row.id, index + 1),
      profileId: num(row.profile_id, 1),
      name: str(row.name, 'Habit'),
      icon: str(row.icon, ''),
      color: str(row.color, ''),
      scheduleKind: (['daily', 'weekly', 'monthly'] as const).find(
        (kind) => kind === row.schedule_kind
      ) ?? 'daily',
      // Clamped to the range the backup schema accepts, so a row that is
      // already out of bounds does not make the rescue file unrestorable too.
      weekdayMask: Math.min(127, Math.max(1, num(row.weekday_mask, 127))),
      targetCount: Math.min(366, Math.max(1, num(row.target_count, 1))),
      dueTime: typeof row.due_time === 'string' ? row.due_time : null,
      remindEnabled: num(row.remind_enabled, 0) !== 0,
      followUps: Math.min(3, Math.max(0, num(row.follow_ups, 3))),
      targetPct: Math.min(100, Math.max(0, num(row.target_pct, 80))),
      startsOn: str(row.starts_on, '2000-01-01'),
      archivedAt: typeof row.archived_at === 'number' ? row.archived_at : null,
      createdAt: num(row.created_at, now),
      updatedAt: num(row.updated_at, now),
    })),
    completions: completionRows.map((row, index) => ({
      id: num(row.id, index + 1),
      habitId: num(row.habit_id, 0),
      day: str(row.day, '2000-01-01'),
      status: row.status === 'skipped' ? ('skipped' as const) : ('done' as const),
      doneAt: num(row.done_at, now),
    })),
  });
}

/**
 * Drops whatever would stop the file being restorable.
 *
 * A rescue file that `parseBackup` refuses is barely a rescue — the one button
 * that could bring it back would reject it, leaving hand-editing as the only
 * way in. So the rules that validator enforces are applied here instead, and
 * anything that breaks them is dropped rather than allowed to condemn the whole
 * file. Losing one malformed row beats losing every good one.
 */
function restorable(data: GrooveData): GrooveData {
  const seenProfile = new Set<number>();
  const seenName = new Set<string>();
  const profiles = data.profiles.filter((profile) => {
    const name = profile.name.trim().toLowerCase();
    if (seenProfile.has(profile.id) || seenName.has(name)) return false;
    seenProfile.add(profile.id);
    seenName.add(name);
    return true;
  });

  const seenHabit = new Set<number>();
  const habits = data.habits.filter((habit) => {
    if (seenHabit.has(habit.id) || !seenProfile.has(habit.profileId)) return false;
    seenHabit.add(habit.id);
    return true;
  });

  const seenDay = new Set<string>();
  const completions = data.completions.filter((entry) => {
    const key = `${entry.habitId}:${entry.day}`;
    if (seenDay.has(key) || !seenHabit.has(entry.habitId)) return false;
    seenDay.add(key);
    return true;
  });

  return { profiles, habits, completions };
}

/** Every rescue file written so far, newest first. */
export function listRescues(): { name: string; uri: string }[] {
  const folder = new Directory(Paths.document, FOLDER);
  if (!folder.exists) return [];
  return folder
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .map((file) => ({ name: file.name, uri: file.uri }))
    .sort((a, b) => b.name.localeCompare(a.name));
}

export function deleteRescue(name: string): void {
  const file = new File(new Directory(Paths.document, FOLDER), name);
  if (file.exists) file.delete();
}

/**
 * Writes the current contents out before the caller destroys them.
 *
 * Returns the filename, or null if there was nothing worth saving or it could
 * not be written. Never throws: this runs on the startup path, and an app that
 * refuses to open because it could not take a backup of a database it was about
 * to delete anyway is strictly worse than one that opens.
 */
export async function writeRescue(db: SQLiteDatabase): Promise<string | null> {
  try {
    const data = await readDefensively(db);
    // Only if there is something a person made. Every install has one seeded
    // profile from the moment it opens, so counting that as worth saving would
    // leave a rescue file behind after every schema change on an empty app —
    // and a folder of identical empty backups is how the one that matters gets
    // ignored.
    const worthSaving =
      data.habits.length > 0 || data.completions.length > 0 || data.profiles.length > 1;
    if (!worthSaving) return null;

    const folder = new Directory(Paths.document, FOLDER);
    if (!folder.exists) folder.create({ intermediates: true });

    const name = backupFilename(new Date(), 'rescue');
    const file = new File(folder, name);
    if (!file.exists) file.create();
    file.write(serializeBackup(data));
    return name;
  } catch (error) {
    console.warn('Could not write a rescue backup before rebuilding:', error);
    return null;
  }
}
