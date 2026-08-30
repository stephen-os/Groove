import { addDays, atTimeOn, todayKey, type DayKey } from './date';
import type { Habit } from './db/habits';
import { habitsDueOn, type CompletionIndex } from './schedule';

// Deciding which notifications should exist. Pure — no OS calls, no database,
// no clock it isn't handed.
//
// Android fires notifications blindly; it has no idea whether you brushed your
// teeth. So the app schedules concrete one-off alerts for a rolling horizon and
// cancels them as habits get ticked. Not Android's repeating daily trigger:
// there is no way to cancel a single occurrence of one.

/**
 * How far ahead alerts are placed, in days.
 *
 * Short on purpose. Android caps how many alarms an app may have pending — the
 * practical ceiling is a few hundred — and every reminder-enabled habit costs
 * `horizon x (1 + follow-ups)` of that budget. Seven days keeps ten such habits
 * at 280 alerts, and the horizon is refilled every time the app is opened.
 */
export const HORIZON_DAYS = 7;

/** Minutes after the due time at which the chain nags again. */
const FOLLOW_UPS: readonly number[] = [15, 30, 60];

/**
 * A hard ceiling on pending alerts, whatever the horizon works out to.
 *
 * Exceeding Android's limit does not throw — the extra alarms are silently
 * dropped, and which ones survive is not defined. Truncating deliberately, in
 * time order, means the alerts that do exist are the soonest ones rather than
 * an arbitrary subset.
 */
const MAX_ALERTS = 400;

export interface PlannedAlert {
  readonly habitId: number;
  readonly day: DayKey;
  /** Epoch milliseconds. */
  readonly fireAt: number;
  /** 0 is the alert at the due time; 1 and up are the follow-ups. */
  readonly sequence: number;
  readonly title: string;
  readonly body: string;
}

/** Every habit due on `day` that wants a reminder and has not been ticked. */
function remindableOn(habits: readonly Habit[], completions: CompletionIndex, day: DayKey) {
  const due = habitsDueOn(habits, completions, day);
  return [...due.daily, ...due.weekly, ...due.monthly]
    .filter((entry) => !entry.done)
    .map((entry) => entry.habit)
    .filter((habit) => habit.remindEnabled && habit.dueTime !== null);
}

/**
 * The alerts that should be pending right now.
 *
 * Walks the horizon a day at a time, asking the schedule engine what is due and
 * skipping anything already done. Alerts whose moment has passed are dropped
 * here rather than handed to the OS: a trigger in the past fires immediately on
 * some Android versions and is discarded on others, and neither is what the
 * user asked for.
 */
export function planAlerts(
  habits: readonly Habit[],
  completions: CompletionIndex,
  now: Date = new Date(),
  horizonDays: number = HORIZON_DAYS,
  followUps: readonly number[] = FOLLOW_UPS,
  maxAlerts: number = MAX_ALERTS
): PlannedAlert[] {
  const alerts: PlannedAlert[] = [];
  const start = todayKey(now);
  const nowMs = now.getTime();

  for (let offset = 0; offset < horizonDays; offset += 1) {
    const day = addDays(start, offset);

    for (const habit of remindableOn(habits, completions, day)) {
      // Narrowed by remindableOn, but TypeScript cannot see through the filter.
      const dueTime = habit.dueTime;
      if (dueTime === null) continue;

      const dueAt = atTimeOn(day, dueTime).getTime();
      const offsets = [0, ...followUps];

      offsets.forEach((minutes, sequence) => {
        const fireAt = dueAt + minutes * 60_000;
        if (fireAt <= nowMs) return;
        alerts.push({
          habitId: habit.id,
          day,
          fireAt,
          sequence,
          title: sequence === 0 ? habit.name : `Still: ${habit.name}`,
          body: sequence === 0 ? `Due by ${dueTime}` : `Was due by ${dueTime}`,
        });
      });
    }
  }

  // Soonest first, so truncation drops the most distant alerts rather than an
  // arbitrary slice of them.
  alerts.sort((a, b) => a.fireAt - b.fireAt);
  return alerts.slice(0, maxAlerts);
}
