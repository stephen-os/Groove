import { todayKey, type DayKey } from '../date';
import { getDatabase } from './client';

/**
 * How a habit decides which days it is due.
 *
 * `daily` reads `weekdayMask` — which covers both "every day" and "Mon–Thu",
 * and also "every Sunday", since a one-bit mask is exactly that. `weekly` and
 * `monthly` ignore the mask and instead need `targetCount` completions anywhere
 * inside the period, which is the one thing a mask cannot express.
 */
export type ScheduleKind = 'daily' | 'weekly' | 'monthly';

export interface Habit {
  id: number;
  profileId: number;
  name: string;
  icon: string;
  color: string;
  scheduleKind: ScheduleKind;
  /** Bitmask indexed by `Date.getDay()`; bit 0 is Sunday. */
  weekdayMask: number;
  targetCount: number;
  /** 'HH:MM' local wall clock, or null when the habit has no due time. */
  dueTime: string | null;
  remindEnabled: boolean;
  /** Follow-up nags after the due-time alert, 0–3. Zero means one and done. */
  followUps: number;
  targetPct: number;
  startsOn: DayKey;
  /** Epoch milliseconds, or null while the habit is active. */
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

// SQLite hands back column names verbatim. Keeping the row shape separate means
// snake_case stops at this file instead of leaking into components.
interface HabitRow {
  id: number;
  profile_id: number;
  name: string;
  icon: string;
  color: string;
  schedule_kind: string;
  weekday_mask: number;
  target_count: number;
  due_time: string | null;
  remind_enabled: number;
  follow_ups: number;
  target_pct: number;
  starts_on: string;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
}

const SCHEDULE_KINDS: readonly string[] = ['daily', 'weekly', 'monthly'];

/**
 * Narrows the stored string back to the union.
 *
 * SQLite has no enum, so this is the boundary where an unexpected value has to
 * be dealt with. Falling back to 'daily' rather than throwing: a single corrupt
 * row should not make the whole list screen fail to render.
 */
const toScheduleKind = (value: string): ScheduleKind =>
  SCHEDULE_KINDS.includes(value) ? (value as ScheduleKind) : 'daily';

export const toHabit = (row: HabitRow): Habit => ({
  id: row.id,
  profileId: row.profile_id,
  name: row.name,
  icon: row.icon,
  color: row.color,
  scheduleKind: toScheduleKind(row.schedule_kind),
  weekdayMask: row.weekday_mask,
  targetCount: row.target_count,
  dueTime: row.due_time,
  remindEnabled: row.remind_enabled !== 0,
  followUps: row.follow_ups,
  targetPct: row.target_pct,
  startsOn: row.starts_on,
  archivedAt: row.archived_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const SELECT_COLUMNS =
  'id, profile_id, name, icon, color, schedule_kind, weekday_mask, target_count, due_time, remind_enabled, follow_ups, target_pct, starts_on, archived_at, created_at, updated_at';

/** The active (non-archived) habits in a profile, in display order. */
export async function listHabits(profileId: number): Promise<Habit[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<HabitRow>(
    `SELECT ${SELECT_COLUMNS} FROM habits
     WHERE profile_id = ? AND archived_at IS NULL
     ORDER BY name`,
    [profileId]
  );
  return rows.map(toHabit);
}

/** The archived habits in a profile, most recently archived first. */
export async function listArchivedHabits(profileId: number): Promise<Habit[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<HabitRow>(
    `SELECT ${SELECT_COLUMNS} FROM habits
     WHERE profile_id = ? AND archived_at IS NOT NULL
     ORDER BY archived_at DESC`,
    [profileId]
  );
  return rows.map(toHabit);
}

/**
 * Every habit in a profile, archived included.
 *
 * The history and the analytics need this: a day three months ago may have had
 * habits on it that were since retired, and they still have to be nameable.
 */
export async function listHabitsWithArchived(profileId: number): Promise<Habit[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<HabitRow>(
    `SELECT ${SELECT_COLUMNS} FROM habits WHERE profile_id = ? ORDER BY name`,
    [profileId]
  );
  return rows.map(toHabit);
}

export async function getHabit(id: number): Promise<Habit | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<HabitRow>(
    `SELECT ${SELECT_COLUMNS} FROM habits WHERE id = ?`,
    [id]
  );
  return row ? toHabit(row) : null;
}

/** The fields a habit's form owns. Everything else is bookkeeping. */
export interface HabitInput {
  name: string;
  icon: string;
  color: string;
  scheduleKind: ScheduleKind;
  weekdayMask: number;
  targetCount: number;
  dueTime: string | null;
  remindEnabled: boolean;
  followUps: number;
  targetPct: number;
}

/** Inserts a habit and returns it as stored, including the id SQLite assigned. */
export async function createHabit(profileId: number, input: HabitInput): Promise<Habit> {
  const db = await getDatabase();
  const now = Date.now();

  const result = await db.runAsync(
    `INSERT INTO habits (
       profile_id, name, icon, color, schedule_kind, weekday_mask, target_count,
       due_time, remind_enabled, follow_ups, target_pct, starts_on,
       created_at, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      profileId,
      input.name,
      input.icon,
      input.color,
      input.scheduleKind,
      input.weekdayMask,
      input.targetCount,
      input.dueTime,
      input.remindEnabled ? 1 : 0,
      input.followUps,
      input.targetPct,
      todayKey(),
      now,
      now,
    ]
  );

  const habit = await getHabit(result.lastInsertRowId);
  if (!habit) throw new Error('The habit vanished immediately after being inserted.');
  return habit;
}

/**
 * Applies an edit to an existing habit.
 *
 * `starts_on` is deliberately untouched. Moving it would rewrite how every past
 * day is judged, and an edit made today should not change what last month looked
 * like.
 */
export async function updateHabit(id: number, input: HabitInput): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE habits SET
       name = ?, icon = ?, color = ?, schedule_kind = ?, weekday_mask = ?,
       target_count = ?, due_time = ?, remind_enabled = ?, follow_ups = ?,
       target_pct = ?, updated_at = ?
     WHERE id = ?`,
    [
      input.name,
      input.icon,
      input.color,
      input.scheduleKind,
      input.weekdayMask,
      input.targetCount,
      input.dueTime,
      input.remindEnabled ? 1 : 0,
      input.followUps,
      input.targetPct,
      Date.now(),
      id,
    ]
  );
}

/**
 * Retires a habit without destroying its history.
 *
 * The rows in `completions` stay, so the analytics still know that the gym was
 * attended forty times before it was given up on.
 */
export async function archiveHabit(id: number): Promise<void> {
  const db = await getDatabase();
  const now = Date.now();
  await db.runAsync('UPDATE habits SET archived_at = ?, updated_at = ? WHERE id = ?', [
    now,
    now,
    id,
  ]);
}

/** Brings an archived habit back. Archiving is a mistake worth being able to undo. */
export async function restoreHabit(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('UPDATE habits SET archived_at = NULL, updated_at = ? WHERE id = ?', [
    Date.now(),
    id,
  ]);
}

/**
 * Erases a habit and every day it was ever completed.
 *
 * The cascade in the schema does the second half. This is the one that actually
 * loses data, which is why the UI puts it behind a different warning from
 * archiving.
 */
export async function deleteHabit(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM habits WHERE id = ?', [id]);
}
