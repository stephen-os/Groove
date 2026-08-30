import { getDatabase } from './client';

// App preferences, stored in the same database as everything else.
//
// A separate key-value store (AsyncStorage/MMKV) would be one more dependency,
// one more thing to back up, and one more thing that can disagree with the
// database after a restore. A two-column table costs nothing and keeps all
// persisted state in one file.

/** Every settings key the app knows about. Adding one here is what makes it typed. */
export type SettingKey = 'themePreference' | 'activeProfileId';

export async function getSetting(key: SettingKey): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [key]
  );
  return row?.value ?? null;
}

export async function setSetting(key: SettingKey, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}
