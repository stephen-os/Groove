import { getDatabase } from './client';

// Device preferences, as opposed to data. The `settings` table is a plain
// key-value store; anything in it describes this installation rather than the
// habits, which is why none of it travels in a backup.

/** The stored value, or null when nothing has been chosen. */
export async function getSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [key]
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}
