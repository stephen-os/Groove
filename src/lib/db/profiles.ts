import { getDatabase } from './client';
import { getSetting } from './settings';

// Profiles are how one person keeps separate habit lists — personal and work —
// without any notion of an account. Exactly one is active at a time; which one
// is a setting, not a column, because it is a property of this device rather
// than of the data.

export interface Profile {
  id: number;
  name: string;
  /** Epoch milliseconds. */
  createdAt: number;
}

/**
 * The profile the app is currently showing.
 *
 * Migration 1 seeds profile 1 and the setting that points at it, so this always
 * has an answer. The fallback covers only the case where a restore has left the
 * setting pointing at a profile the imported file did not contain — falling back
 * to the lowest id shows *something* rather than an empty app with no way out.
 */
export async function getActiveProfileId(): Promise<number> {
  const stored = await getSetting('activeProfileId');
  const parsed = stored === null ? Number.NaN : Number.parseInt(stored, 10);
  if (Number.isInteger(parsed)) {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ id: number }>('SELECT id FROM profiles WHERE id = ?', [
      parsed,
    ]);
    if (row) return row.id;
  }

  const db = await getDatabase();
  const first = await db.getFirstAsync<{ id: number }>('SELECT id FROM profiles ORDER BY id LIMIT 1');
  if (!first) throw new Error('No profiles exist. The database was not migrated correctly.');
  return first.id;
}
