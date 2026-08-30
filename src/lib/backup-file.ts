import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { backupFilename, parseBackup, serializeBackup } from './backup';
import { exportData, replaceData } from './db/data';

// The file-system half of backup. Kept apart from backup.ts so the parsing and
// validation logic stays pure and testable; everything here is IO.

export type BackupOutcome = { ok: true; message: string } | { ok: false; message: string };

/**
 * Writes the whole database to a JSON file and opens the system share sheet.
 *
 * The file goes to the cache directory on purpose: once it has been shared out
 * to Drive, email or a USB cable, the copy has served its purpose and the OS is
 * free to reclaim it. Writing backups into permanent storage would quietly grow
 * forever.
 */
export async function exportBackup(): Promise<BackupOutcome> {
  try {
    const data = await exportData();
    const file = new File(Paths.cache, backupFilename());

    // `create` then `write` — write alone fails if the file does not exist.
    if (!file.exists) file.create();
    file.write(serializeBackup(data));

    if (!(await Sharing.isAvailableAsync())) {
      return {
        ok: false,
        message: `Sharing is unavailable on this device. The backup is at ${file.uri}`,
      };
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/json',
      dialogTitle: 'Save backup',
    });

    return {
      ok: true,
      message: `Exported ${data.habits.length} habit(s) and ${data.completions.length} completed day(s).`,
    };
  } catch (error) {
    console.error('Backup export failed:', error);
    return { ok: false, message: 'Could not create the backup file.' };
  }
}

/**
 * Lets the user pick a backup file and replaces the whole database with it.
 *
 * 1. Pick a file. Cancelling is a normal outcome, not an error.
 * 2. Read and validate it — this is the untrusted boundary (see backup.ts).
 * 3. Only once it has fully validated, replace the database contents.
 *
 * Nothing is written until validation passes, so a bad file leaves existing data
 * untouched. The caller is expected to have confirmed with the user first —
 * this function overwrites without asking.
 */
export async function importBackup(): Promise<BackupOutcome> {
  try {
    const picked = await File.pickFileAsync({ mimeTypes: 'application/json' });
    if (picked.canceled) return { ok: false, message: 'Import cancelled.' };

    const text = await picked.result.text();
    const parsed = parseBackup(text);
    if (!parsed.ok) return { ok: false, message: parsed.error };

    await replaceData(parsed.backup);
    return {
      ok: true,
      message: `Restored ${parsed.backup.habits.length} habit(s) and ${parsed.backup.completions.length} completed day(s).`,
    };
  } catch (error) {
    console.error('Backup import failed:', error);
    return { ok: false, message: 'Could not read that file.' };
  }
}
