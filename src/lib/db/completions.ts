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
 * The habits completed on a given day, as a set of ids.
 *
 * A set rather than a list of rows: every caller is asking "is this one ticked",
 * and handing the screen the shape it actually needs keeps the lookup out of the
 * render path.
 */
export async function completedOn(day: DayKey): Promise<Set<number>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ habit_id: number }>(
    'SELECT habit_id FROM completions WHERE day = ?',
    [day]
  );
  return new Set(rows.map((row) => row.habit_id));
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
