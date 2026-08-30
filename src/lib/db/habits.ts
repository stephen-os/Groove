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
  sortOrder: number;
  scheduleKind: ScheduleKind;
  /** Bitmask indexed by `Date.getDay()`; bit 0 is Sunday. */
  weekdayMask: number;
  targetCount: number;
  /** 'HH:MM' local wall clock, or null when the habit has no due time. */
  dueTime: string | null;
  remindEnabled: boolean;
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
  sort_order: number;
  schedule_kind: string;
  weekday_mask: number;
  target_count: number;
  due_time: string | null;
  remind_enabled: number;
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
  sortOrder: row.sort_order,
  scheduleKind: toScheduleKind(row.schedule_kind),
  weekdayMask: row.weekday_mask,
  targetCount: row.target_count,
  dueTime: row.due_time,
  remindEnabled: row.remind_enabled !== 0,
  targetPct: row.target_pct,
  startsOn: row.starts_on,
  archivedAt: row.archived_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const SELECT_COLUMNS =
  'id, profile_id, name, icon, color, sort_order, schedule_kind, weekday_mask, target_count, due_time, remind_enabled, target_pct, starts_on, archived_at, created_at, updated_at';

/** The active (non-archived) habits in a profile, in display order. */
export async function listHabits(profileId: number): Promise<Habit[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<HabitRow>(
    `SELECT ${SELECT_COLUMNS} FROM habits
     WHERE profile_id = ? AND archived_at IS NULL
     ORDER BY sort_order, id`,
    [profileId]
  );
  return rows.map(toHabit);
}

export interface NewHabit {
  profileId: number;
  name: string;
  scheduleKind: ScheduleKind;
  weekdayMask: number;
  targetCount: number;
}

/** Inserts a habit and returns it as stored, including the id SQLite assigned. */
export async function createHabit(input: NewHabit): Promise<Habit> {
  const db = await getDatabase();
  const now = Date.now();
  const startsOn = todayKey();

  // sort_order is derived in the statement rather than read first: two rapid
  // taps would otherwise both read the same max and land on the same position.
  const result = await db.runAsync(
    `INSERT INTO habits (
       profile_id, name, schedule_kind, weekday_mask, target_count,
       starts_on, created_at, updated_at, sort_order
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?,
       (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM habits WHERE profile_id = ?))`,
    [
      input.profileId,
      input.name,
      input.scheduleKind,
      input.weekdayMask,
      input.targetCount,
      startsOn,
      now,
      now,
      input.profileId,
    ]
  );

  const row = await db.getFirstAsync<HabitRow>(
    `SELECT ${SELECT_COLUMNS} FROM habits WHERE id = ?`,
    [result.lastInsertRowId]
  );
  if (!row) throw new Error('The habit vanished immediately after being inserted.');
  return toHabit(row);
}

/**
 * Retires a habit without destroying its history.
 *
 * The rows in `completions` stay, so the analytics still know that the gym was
 * attended forty times before it was given up on. A hard delete exists too, but
 * it belongs behind a warning rather than behind the ordinary remove button.
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
