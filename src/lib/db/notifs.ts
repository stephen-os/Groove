import type { DayKey } from '../date';
import { getDatabase } from './client';

// Which OS notification ids are currently pending, so a habit being ticked can
// cancel exactly that day's chain instead of tearing down and rebuilding the
// whole horizon. Device-local bookkeeping — never exported in a backup, because
// the ids mean nothing on another phone.

export interface ScheduledNotif {
  habitId: number;
  day: DayKey;
  notificationId: string;
  /** True when the user asked for this one by tapping Snooze. */
  snoozed?: boolean;
}

/** A snooze still waiting to fire. */
export interface PendingSnooze {
  habitId: number;
  day: DayKey;
  /** Epoch milliseconds. */
  fireAt: number;
}

/** Records one more pending alert, leaving every other habit's record alone. */
export async function addScheduledNotif(
  notif: ScheduledNotif & { fireAt: number }
): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO scheduled_notifs (habit_id, day, notification_id, fire_at, snoozed)
     VALUES (?, ?, ?, ?, ?)`,
    [notif.habitId, notif.day, notif.notificationId, notif.fireAt, notif.snoozed ? 1 : 0]
  );
}

/**
 * Snoozes that have not fired yet.
 *
 * Read before a resync tears every pending alert down, so the ones the user
 * explicitly asked for can be put back afterwards. Nothing else can reconstruct
 * them: `planAlerts` works from the habit's schedule and knows nothing about a
 * button someone pressed at ten past seven.
 */
export async function pendingSnoozes(after: number): Promise<PendingSnooze[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ habit_id: number; day: string; fire_at: number }>(
    'SELECT habit_id, day, fire_at FROM scheduled_notifs WHERE snoozed = 1 AND fire_at > ?',
    [after]
  );
  return rows.map((row) => ({ habitId: row.habit_id, day: row.day, fireAt: row.fire_at }));
}

/** The ids pending for one habit on one day — the chain a tick cancels. */
export async function notifIdsFor(habitId: number, day: DayKey): Promise<string[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ notification_id: string }>(
    'SELECT notification_id FROM scheduled_notifs WHERE habit_id = ? AND day = ?',
    [habitId, day]
  );
  return rows.map((row) => row.notification_id);
}

export async function forgetNotifsFor(habitId: number, day: DayKey): Promise<void> {
  const db = await getDatabase();
  await db.runAsync('DELETE FROM scheduled_notifs WHERE habit_id = ? AND day = ?', [habitId, day]);
}

/**
 * Replaces the whole record of pending alerts in one transaction.
 *
 * A resync cancels everything and schedules afresh, so the table is rewritten
 * rather than reconciled — there is no partial state worth preserving, and a
 * crash mid-write leaves the previous record intact rather than half of each.
 */
export async function replaceScheduledNotifs(
  notifs: readonly (ScheduledNotif & { fireAt: number })[]
): Promise<void> {
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync('DELETE FROM scheduled_notifs');
    for (const notif of notifs) {
      await txn.runAsync(
        `INSERT INTO scheduled_notifs (habit_id, day, notification_id, fire_at, snoozed)
         VALUES (?, ?, ?, ?, ?)`,
        [notif.habitId, notif.day, notif.notificationId, notif.fireAt, notif.snoozed ? 1 : 0]
      );
    }
  });
}
