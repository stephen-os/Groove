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
