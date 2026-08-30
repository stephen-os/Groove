import type { DayKey } from '../date';
import { getDatabase } from './client';

// One row per habit per day it was done. The absence of a row is the "not done"
// state — there is no false-valued row to keep in step, and no way to represent
// the same habit being completed twice on one day.

export interface Completion {
  id: number;
  habitId: number;
  day: DayKey;
  /** Epoch milliseconds — when it was actually ticked, which may not be `day`. */
  doneAt: number;
}

interface CompletionRow {
  id: number;
  habit_id: number;
  day: string;
  done_at: number;
}

export const toCompletion = (row: CompletionRow): Completion => ({
  id: row.id,
  habitId: row.habit_id,
  day: row.day,
  doneAt: row.done_at,
});

/**
 * Every completion between two days, inclusive.
 *
 * Day keys are ISO-ordered, so a string comparison is a chronological one and
 * SQLite can answer this straight off the index rather than parsing dates.
 */
export async function completionsBetween(from: DayKey, to: DayKey): Promise<Completion[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<CompletionRow>(
    'SELECT id, habit_id, day, done_at FROM completions WHERE day >= ? AND day <= ?',
    [from, to]
  );
  return rows.map(toCompletion);
}

/**
 * Ticks or un-ticks a habit for one day.
 *
 * `ON CONFLICT DO NOTHING` leans on the unique index rather than reading first:
 * a double-tap cannot create a second row, and there is no read-then-write gap
 * for it to slip through.
 */
export async function setDone(habitId: number, day: DayKey, done: boolean): Promise<void> {
  const db = await getDatabase();
  if (done) {
    await db.runAsync(
      `INSERT INTO completions (habit_id, day, done_at) VALUES (?, ?, ?)
       ON CONFLICT(habit_id, day) DO NOTHING`,
      [habitId, day, Date.now()]
    );
  } else {
    await db.runAsync('DELETE FROM completions WHERE habit_id = ? AND day = ?', [habitId, day]);
  }
}
