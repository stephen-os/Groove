import { getDatabase } from './client';

// Profiles are how one person keeps separate habit lists — personal and work —
// without any notion of an account. Exactly one is active at a time; which one
// lives in the `settings` table rather than a column, because it is a property
// of this device rather than of the data.

export interface Profile {
  id: number;
  name: string;
  /** Epoch milliseconds. */
  createdAt: number;
}

interface ProfileRow {
  id: number;
  name: string;
  created_at: number;
}

const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
});

/**
 * The profile the app is currently showing.
 *
 * The schema seeds profile 1 and the setting that points at it, so this always
 * has an answer. The fallback covers the one case that can break that: a restore
 * whose backup did not contain the profile the setting names. Falling back to
 * the lowest id shows *something* rather than an empty app with no way out.
 */
export async function getActiveProfileId(): Promise<number> {
  const db = await getDatabase();

  const setting = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'activeProfileId'"
  );
  const stored = setting ? Number.parseInt(setting.value, 10) : Number.NaN;

  if (Number.isInteger(stored)) {
    const match = await db.getFirstAsync<{ id: number }>('SELECT id FROM profiles WHERE id = ?', [
      stored,
    ]);
    if (match) return match.id;
  }

  const first = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM profiles ORDER BY id LIMIT 1'
  );
  if (!first) throw new Error('No profiles exist. The database was not built correctly.');
  return first.id;
}

export async function setActiveProfile(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES ('activeProfileId', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(id)]
  );
}

/** Creates a profile and switches to it — creating one is always to use it. */
export async function createProfile(name: string): Promise<Profile> {
  const db = await getDatabase();
  const now = Date.now();
  const result = await db.runAsync('INSERT INTO profiles (name, created_at) VALUES (?, ?)', [
    name,
    now,
  ]);
  await setActiveProfile(result.lastInsertRowId);
  return { id: result.lastInsertRowId, name, createdAt: now };
}

export async function renameProfile(id: number, name: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE profiles SET name = ? WHERE id = ?', [name, id]);
}

/**
 * Deletes a profile and everything in it.
 *
 * The cascade takes its habits, their completions and their pending alerts. The
 * last profile cannot be deleted: the whole app assumes one always exists, and
 * "erase all data" is the operation that means what deleting it would.
 */
export async function deleteProfile(id: number): Promise<void> {
  const db = await getDatabase();
  const others = await db.getAllAsync<{ id: number }>(
    'SELECT id FROM profiles WHERE id != ? ORDER BY id',
    [id]
  );
  if (others.length === 0) {
    throw new Error('The last profile cannot be deleted.');
  }

  // Only move the active profile if the one being deleted *was* active.
  // Reassigning unconditionally walked the user off a profile they had not
  // touched, every time they tidied up a different one.
  const active = await getActiveProfileId();

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM profiles WHERE id = ?', [id]);
    if (active === id) {
      await txn.runAsync(
        `INSERT INTO settings (key, value) VALUES ('activeProfileId', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        [String(others[0].id)]
      );
    }
  });
}

/**
 * Empties a profile without removing it.
 *
 * Deleting its habits cascades to their completions, so this clears the history
 * as well — which is what "start over" means. The profile and its name survive.
 */
export async function resetProfile(id: number): Promise<void> {
  const db = await getDatabase();
  // One statement, so it is already atomic — no transaction to open.
  await db.runAsync('DELETE FROM habits WHERE profile_id = ?', [id]);
}

/**
 * Erases everything and starts again with one empty profile.
 *
 * Rebuilds the same state the schema seeds on a fresh install, rather than
 * leaving the app with no profile at all — every screen assumes one exists.
 */
export async function eraseAllData(): Promise<void> {
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync('DELETE FROM profiles');
    const result = await txn.runAsync('INSERT INTO profiles (name, created_at) VALUES (?, ?)', [
      'Personal',
      Date.now(),
    ]);
    await txn.runAsync(
      `INSERT INTO settings (key, value) VALUES ('activeProfileId', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [String(result.lastInsertRowId)]
    );
  });
}

/**
 * Every profile name currently in use.
 *
 * Read before an import so a clash can be put to the user as a question rather
 * than discovered as a constraint failure half way through writing.
 */
export async function profileNames(): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ name: string }>('SELECT name FROM profiles ORDER BY id');
  return rows.map((row) => row.name);
}

/** A profile with enough about it to choose between it and another. */
export interface ProfileSummary extends Profile {
  /** Active habits — archived ones are history, not part of the setup. */
  habitCount: number;
  completionCount: number;
}

/**
 * Every profile, with the size of what is inside it.
 *
 * A switcher listing bare names asks you to choose without telling you anything
 * to choose on, which after a couple of imports is a list of near-identical
 * words. The counts are what make one recognisable as the real one.
 */
export async function listProfileSummaries(): Promise<ProfileSummary[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<
    ProfileRow & { habit_count: number; completion_count: number }
  >(
    `SELECT p.id, p.name, p.created_at,
            (SELECT COUNT(*) FROM habits h
              WHERE h.profile_id = p.id AND h.archived_at IS NULL) AS habit_count,
            (SELECT COUNT(*) FROM completions c
               JOIN habits h2 ON h2.id = c.habit_id
              WHERE h2.profile_id = p.id) AS completion_count
       FROM profiles p
      ORDER BY p.id`
  );
  return rows.map((row) => ({
    ...toProfile(row),
    habitCount: row.habit_count,
    completionCount: row.completion_count,
  }));
}
