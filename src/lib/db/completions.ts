import type { DayKey } from '../date';
import { getDatabase } from './client';

// One row per habit per day it was acted on. Three states in total:
//
//   'done'     — completed.
//   'skipped'  — deliberately opted out of. Silences the reminder and comes out
//                of the denominator, so a day away does not read as a failure.
//   no row     — not done, and counted against you. This is the default, and it
//                is the absence of a row rather than a value, so there is no
//                false-valued row to keep in step.

export type CompletionStatus = 'done' | 'skipped';

export interface Completion {
  id: number;
  habitId: number;
  day: DayKey;
  status: CompletionStatus;
  /** Epoch milliseconds — when it was actually marked, which may not be `day`. */
  doneAt: number;
}

interface CompletionRow {
  id: number;
  habit_id: number;
  day: string;
  status: string;
  done_at: number;
}

export const toCompletion = (row: CompletionRow): Completion => ({
  id: row.id,
  habitId: row.habit_id,
  day: row.day,
  // SQLite has no enum, so this is the boundary where an unexpected value has
  // to be dealt with. Anything unrecognised reads as 'done', which is what
  // every row written before skipping existed meant.
  status: row.status === 'skipped' ? 'skipped' : 'done',
  doneAt: row.done_at,
});

const SELECT_COLUMNS = 'id, habit_id, day, status, done_at';

/**
 * Every completion between two days, inclusive.
 *
 * Day keys are ISO-ordered, so a string comparison is a chronological one and
 * SQLite can answer this straight off the index rather than parsing dates.
 */
export async function completionsBetween(from: DayKey, to: DayKey): Promise<Completion[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<CompletionRow>(
    `SELECT ${SELECT_COLUMNS} FROM completions WHERE day >= ? AND day <= ?`,
    [from, to]
  );
  return rows.map(toCompletion);
}

/**
 * Every completion a profile has ever recorded.
 *
 * The analytics need the lot, not just the window being viewed: a streak is
 * counted back over the habit's whole life, so a 90-day query would report a
 * two-year run as ninety days. The volume is small — one row per habit per day
 * it was acted on — and it is all local.
 */
export async function completionsForProfile(profileId: number): Promise<Completion[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<CompletionRow>(
    `SELECT c.id, c.habit_id, c.day, c.status, c.done_at
     FROM completions c
     JOIN habits h ON h.id = c.habit_id
     WHERE h.profile_id = ?`,
    [profileId]
  );
  return rows.map(toCompletion);
}

/**
 * Sets what happened to a habit on one day, or clears it with `null`.
 *
 * The upsert leans on the unique index rather than reading first: a double-tap
 * cannot create a second row, and there is no read-then-write gap for one to
 * slip through.
 */
export async function setStatus(
  habitId: number,
  day: DayKey,
  status: CompletionStatus | null
): Promise<void> {
  const db = await getDatabase();

  if (status === null) {
    await db.runAsync('DELETE FROM completions WHERE habit_id = ? AND day = ?', [habitId, day]);
    return;
  }

  await db.runAsync(
    `INSERT INTO completions (habit_id, day, status, done_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(habit_id, day) DO UPDATE SET status = excluded.status, done_at = excluded.done_at`,
    [habitId, day, status, Date.now()]
  );
}
