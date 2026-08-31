import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import {
  backupFilename,
  MAX_BACKUP_BYTES,
  parseBackup,
  serializeBackup,
  tooLarge,
} from './backup';
import { todayKey } from './date';
import { exportData, importProfiles, replaceData, type GrooveData } from './db/data';
import { getActiveProfileId, profileNames } from './db/profiles';
import { clashingProfiles, planImport, scopeToProfile, stripHistory } from './transfer';

// The file-system half of transfer and backup. Kept apart from backup.ts and
// transfer.ts so the parsing, validation and reshaping stay pure and testable;
// everything here is IO.

export type BackupOutcome = { ok: true; message: string } | { ok: false; message: string };

/**
 * Writes a file and opens the system share sheet.
 *
 * The file goes to the cache directory on purpose: once it has been shared out
 * to Drive, email or a USB cable, the copy has served its purpose and the OS is
 * free to reclaim it. Writing exports into permanent storage would quietly grow
 * forever.
 */
async function shareAs(data: GrooveData, kind: string, message: string): Promise<BackupOutcome> {
  const file = new File(Paths.cache, backupFilename(new Date(), kind));

  // `create` then `write` — write alone fails if the file does not exist.
  if (!file.exists) file.create();
  file.write(serializeBackup(data));

  if (!(await Sharing.isAvailableAsync())) {
    return {
      ok: false,
      message: `Sharing is unavailable on this device. The file is at ${file.uri}`,
    };
  }

  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Save file' });
  return { ok: true, message };
}

/**
 * This profile's habits, with no history attached — the "move my setup" export.
 *
 * `stripHistory` is what makes the file honest on another phone: it drops the
 * completions, drops habits that were only being kept for their history, and
 * moves every start date to today so the receiving phone does not open on a
 * backlog of days it was never asked about.
 */
export async function exportHabits(): Promise<BackupOutcome> {
  try {
    const profileId = await getActiveProfileId();
    const mine = stripHistory(scopeToProfile(await exportData(), profileId), todayKey());
    return await shareAs(
      mine,
      'habits',
      `Exported ${mine.habits.length} habit(s), without any history.`
    );
  } catch (error) {
    console.error('Habit export failed:', error);
    return { ok: false, message: 'Could not create that file.' };
  }
}

/** This profile, history and all. */
export async function exportProfile(): Promise<BackupOutcome> {
  try {
    const profileId = await getActiveProfileId();
    const mine = scopeToProfile(await exportData(), profileId);
    return await shareAs(
      mine,
      'profile',
      `Exported ${mine.habits.length} habit(s) and ${mine.completions.length} completed day(s).`
    );
  } catch (error) {
    console.error('Profile export failed:', error);
    return { ok: false, message: 'Could not create that file.' };
  }
}

/** Every profile on the device — the file that moves the whole app to a new phone. */
export async function exportBackup(): Promise<BackupOutcome> {
  try {
    const data = await exportData();
    return await shareAs(
      data,
      '',
      `Exported ${data.profiles.length} profile(s), ${data.habits.length} habit(s) and ${data.completions.length} completed day(s).`
    );
  } catch (error) {
    console.error('Backup export failed:', error);
    return { ok: false, message: 'Could not create the backup file.' };
  }
}

/**
 * Picks a file and reads it, then hands back what it contained.
 *
 * The untrusted boundary, and the order of the steps is the point:
 *
 * 1. Pick a file. Cancelling is a normal outcome, not an error.
 * 2. Refuse anything too large to be one of ours, *before* reading it. Every
 *    other bound is applied by Zod, which needs the file in memory first — far
 *    too late to stop a 2GB pick from killing the app.
 * 3. Read and validate it (see backup.ts).
 */
async function readPickedFile(): Promise<
  { ok: true; data: GrooveData } | { ok: false; message: string }
> {
  const picked = await File.pickFileAsync({ mimeTypes: 'application/json' });
  if (picked.canceled) return { ok: false, message: 'Cancelled.' };

  if (tooLarge(picked.result.size)) {
    const limit = Math.round(MAX_BACKUP_BYTES / (1024 * 1024));
    return {
      ok: false,
      message: `That file is far too large to be a Groove file (over ${limit}MB).`,
    };
  }

  const parsed = parseBackup(await picked.result.text());
  if (!parsed.ok) return { ok: false, message: parsed.error };
  return { ok: true, data: parsed.backup };
}

/**
 * What a picked import file turned out to be.
 *
 * Reading and writing are separate calls because a name may have to be settled
 * in between. Profile names are unique, so a file naming a profile this device
 * already has cannot simply be written — and inventing one produced "Personal"
 * directly above "Personal (imported)", which is the confusion the uniqueness
 * rule exists to prevent. `clashes` is the question to put to the user; nothing
 * has been written when it is non-empty.
 */
export type ImportFile =
  | {
      ok: true;
      data: GrooveData;
      clashes: { id: number; name: string }[];
      /** Names already on this device, so a replacement can be checked as it is typed. */
      taken: string[];
    }
  | { ok: false; message: string };

/** Picks and validates a file, and says which of its names are already in use. */
export async function readImportFile(): Promise<ImportFile> {
  try {
    const read = await readPickedFile();
    if (!read.ok) return read;

    const taken = await profileNames();
    return { ok: true, data: read.data, clashes: clashingProfiles(read.data, taken), taken };
  } catch (error) {
    console.error('Import failed:', error);
    return { ok: false, message: 'Could not read that file.' };
  }
}

/**
 * Writes a read file in as new profiles, leaving everything already here alone.
 *
 * The safe direction, and the only import reachable from the transfer card. It
 * cannot merge into the profile you are on, because it does not write into an
 * existing profile at all — it makes new ones. A regretted import is undone by
 * deleting what it made.
 *
 * `names` answers whatever `readImportFile` reported as clashing, keyed by the
 * id each profile carries in the file.
 */
export async function commitImport(
  data: GrooveData,
  names: ReadonlyMap<number, string>
): Promise<BackupOutcome> {
  try {
    const summary = await importProfiles(planImport(data, names));
    const history =
      summary.completions === 0 ? 'no history' : `${summary.completions} completed day(s)`;
    return {
      ok: true,
      message: `Imported ${summary.habits} habit(s) and ${history} into "${summary.name}".`,
    };
  } catch (error) {
    console.error('Import failed:', error);
    // The unique index is the backstop for a name that slipped through the
    // question, and it aborts the whole transaction rather than landing half a
    // profile — so there is nothing to clean up, only something to say.
    return { ok: false, message: 'Could not import that file. Those profile names may be in use.' };
  }
}

/**
 * Replaces the entire database with a backup file.
 *
 * The destructive direction, which is why it lives among the other irreversible
 * actions rather than beside the exports. Nothing is written until validation
 * passes, so a bad file leaves existing data untouched — but a good one takes
 * everything with it. The caller is expected to have confirmed with the user
 * first; this function overwrites without asking.
 */
export async function importBackup(): Promise<BackupOutcome> {
  try {
    const read = await readPickedFile();
    if (!read.ok) return read;

    await replaceData(read.data);
    return {
      ok: true,
      message: `Restored ${read.data.habits.length} habit(s) and ${read.data.completions.length} completed day(s).`,
    };
  } catch (error) {
    console.error('Backup import failed:', error);
    return { ok: false, message: 'Could not read that file.' };
  }
}
