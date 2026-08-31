import type { NotificationResponse } from 'expo-notifications';
import { addDays, toDayKey, todayKey } from './date';
import { completionsBetween, setStatus } from './db/completions';
import { getHabit, listHabits } from './db/habits';
import {
  addScheduledNotif,
  forgetNotifsFor,
  notifIdsFor,
  pendingSnoozes,
  replaceScheduledNotifs,
} from './db/notifs';
import { getActiveProfileId } from './db/profiles';
import {
  cancelAlerts,
  cancelAllAlerts,
  dismissAlerts,
  DONE_ACTION,
  ensureNotificationPermission,
  readPayload,
  scheduleAlert,
  SNOOZE_ACTION,
  SNOOZE_MINUTES,
  type ReminderPayload,
} from './notifications';
import { HORIZON_DAYS, planAlerts } from './reminder-plan';
import { indexCompletions, monthRange, weekRange } from './schedule';

// Keeping the OS's pending alerts in step with what the database says should
// exist. The decision of what *should* exist is planAlerts, which is pure; this
// module is the part that talks to the notification service.

/**
 * The sync in flight, if any, and the one queued behind it.
 *
 * A sync is cancel-everything, schedule, then record. Two overlapping runs
 * interleave into nonsense: the second one's cancel-all wipes the alerts the
 * first has just placed, and the first then records ids the OS no longer has,
 * so ticking a habit cancels nothing and the follow-ups arrive anyway. It is
 * easy to hit — nine call sites, one of them an AppState listener that fires
 * whenever a share sheet or a file picker closes.
 *
 * So runs are serialised. But joining the run already going is not enough, and
 * was its own bug: that run read the database *before* the caller wrote to it,
 * so awaiting it was a guarantee about nothing. `cancelDayChain` leans on
 * exactly that await to redraw the plan when a tick may have met a target, and
 * got a promise that resolved without re-reading anything.
 *
 * A caller arriving mid-run therefore gets a *follow-up* run, which starts once
 * the current one has finished and so cannot miss their write. One follow-up is
 * enough however many callers arrive: they are all asking the same question,
 * and the answer is whatever the database says once everything has settled.
 */
let inFlight: Promise<void> | null = null;
let queued: Promise<void> | null = null;

/**
 * Cancels and re-places every pending alert.
 *
 * Called when the app comes to the foreground, and after any edit that could
 * change what is due. Cancel-all-then-reschedule rather than diffing: the plan
 * is small, the reconciliation logic a diff would need is exactly the kind that
 * rots silently, and a wrong diff leaves a reminder for a habit you deleted.
 *
 * The cheaper path for the common case — ticking a habit — is `cancelDayChain`,
 * which touches only that day's alerts.
 */
export function syncReminders(): Promise<void> {
  if (!inFlight) {
    inFlight = runSync().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  queued ??= inFlight.then(() => {
    // Cleared before starting, so a caller arriving from here on queues the
    // next one rather than joining a run that has already begun reading.
    queued = null;
    inFlight = runSync().finally(() => {
      inFlight = null;
    });
    return inFlight;
  });
  return queued;
}

async function runSync(): Promise<void> {
  try {
    const profileId = await getActiveProfileId();
    const habits = await listHabits(profileId);

    const wantsReminders = habits.some(
      (habit) => habit.remindEnabled && habit.dueTime !== null
    );

    // Nothing to place. Still clear what is pending — a habit whose reminders
    // were just switched off has alerts that must not survive.
    if (!wantsReminders) {
      await cancelAllAlerts();
      await replaceScheduledNotifs([]);
      return;
    }

    // Asked here rather than at habit-creation time, so a refusal costs the
    // user nothing they were in the middle of.
    if (!(await ensureNotificationPermission())) {
      await cancelAllAlerts();
      await replaceScheduledNotifs([]);
      return;
    }

    // Flexible habits count completions across their whole week or month, and
    // the horizon can run into the next one, so the load covers the periods
    // containing both ends of it.
    const today = todayKey();
    const last = addDays(today, HORIZON_DAYS - 1);
    const starts = [weekRange(today).from, monthRange(today).from];
    const ends = [weekRange(last).to, monthRange(last).to];
    const completions = await completionsBetween(
      starts.reduce((a, b) => (a < b ? a : b)),
      ends.reduce((a, b) => (a > b ? a : b))
    );

    const index = indexCompletions(completions);
    const plan = planAlerts(habits, index, new Date());

    // Read before anything is torn down. These are alerts the user asked for by
    // hand, and the plan cannot recreate them.
    const snoozes = await pendingSnoozes(Date.now());

    await cancelAllAlerts();

    const placed: {
      habitId: number;
      day: string;
      notificationId: string;
      fireAt: number;
      snoozed?: boolean;
    }[] = [];
    for (const alert of plan) {
      const id = await scheduleAlert(alert.title, alert.body, new Date(alert.fireAt), {
        habitId: alert.habitId,
        day: alert.day,
      });
      // A null id means the OS refused this one. Recording it anyway would make
      // the table claim an alert that does not exist.
      if (id !== null) {
        placed.push({
          habitId: alert.habitId,
          day: alert.day,
          notificationId: id,
          fireAt: alert.fireAt,
        });
      }
    }

    // Put the snoozes back. Dropped rather than restored when the habit has
    // since been acted on — a snooze is "remind me again", not "remind me even
    // if I have done it".
    for (const snooze of snoozes) {
      const habit = habits.find((entry) => entry.id === snooze.habitId);
      if (!habit) continue;
      if (index.get(snooze.habitId)?.get(snooze.day) !== undefined) continue;

      const id = await scheduleAlert(
        `Still: ${habit.name}`,
        'Snoozed',
        new Date(snooze.fireAt),
        { habitId: snooze.habitId, day: snooze.day }
      );
      if (id !== null) {
        placed.push({
          habitId: snooze.habitId,
          day: snooze.day,
          notificationId: id,
          fireAt: snooze.fireAt,
          snoozed: true,
        });
      }
    }

    await replaceScheduledNotifs(placed);
  } catch (error) {
    // A reminder that fails to schedule must never break the screen that
    // triggered the sync.
    console.warn('Could not sync reminders:', error);
  }
}

/**
 * Cancels the rest of one habit's chain for one day.
 *
 * This is what makes "notify me until it is done" work: the alerts are placed
 * blind, and ticking the box is what silences the ones still to come.
 *
 * A day is the right unit for a daily habit and the wrong one for a flexible
 * one. `planAlerts` places an alert on every day of the horizon while a weekly
 * habit is still short of its target, so ticking the third gym session on
 * Wednesday leaves Thursday through Sunday still armed — four more evenings of
 * being chased about a week already finished. When a tick might have met a
 * target, the whole plan has to be redrawn, which `syncReminders` does.
 */
export async function cancelDayChain(habitId: number, day: string): Promise<void> {
  try {
    // Never mid-sync. A sync cancels every alert with the OS and only rewrites
    // `scheduled_notifs` at the end, so in between the table names ids that no
    // longer exist. Cancelling those succeeds and achieves nothing — the real
    // alerts are then placed *after* this ran, and nothing is left that could
    // ever cancel them, so a habit ticked in that window keeps being chased all
    // day. Waiting costs one sync and removes the window entirely.
    if (inFlight) await inFlight;

    const ids = await notifIdsFor(habitId, day);
    if (ids.length > 0) {
      await cancelAlerts(ids);
      // Cancelling only stops what has not fired. Anything already delivered is
      // still in the shade offering a Done button for the habit just ticked.
      await dismissAlerts(ids);
      await forgetNotifsFor(habitId, day);
    }

    const habit = await getHabit(habitId);
    if (habit && habit.scheduleKind !== 'daily') await syncReminders();
  } catch (error) {
    console.warn('Could not cancel that reminder chain:', error);
  }
}

/**
 * Places one more alert a quarter of an hour out, for the "not yet" mornings.
 *
 * Refused if that would land after the day is over. `planAlerts` guards exactly
 * this for the chain it draws — an 11:30pm habit must not chase you at half
 * past midnight about yesterday — and a snooze reuses the original payload, so
 * without the same guard the Done button on it would tick *yesterday*.
 */
async function snooze(payload: ReminderPayload): Promise<void> {
  const habit = await getHabit(payload.habitId);
  if (!habit) return;

  const fireAt = new Date(Date.now() + SNOOZE_MINUTES * 60_000);
  if (toDayKey(fireAt) !== payload.day) return;

  const id = await scheduleAlert(`Still: ${habit.name}`, 'Snoozed', fireAt, payload);
  if (id === null) return;

  // Appended, not replaced: the snoozed alert joins the rest of the day's chain
  // so that ticking the habit later cancels this one too. Flagged, so the next
  // resync can tell it apart from an alert the plan produced and put it back
  // rather than quietly destroying it.
  await addScheduledNotif({
    habitId: payload.habitId,
    day: payload.day,
    notificationId: id,
    fireAt: fireAt.getTime(),
    snoozed: true,
  });
}

/**
 * Handles a tap on a reminder's action button.
 *
 * Registered once at startup. The payload is validated rather than cast — a
 * notification can outlive the build that scheduled it.
 */
export async function handleReminderResponse(response: NotificationResponse): Promise<void> {
  const payload = readPayload(response.notification.request.content.data);
  if (payload === null) return;

  try {
    if (response.actionIdentifier === DONE_ACTION) {
      await setStatus(payload.habitId, payload.day, 'done');
      await cancelDayChain(payload.habitId, payload.day);
      return;
    }
    if (response.actionIdentifier === SNOOZE_ACTION) {
      await snooze(payload);
    }
  } catch (error) {
    console.warn('Could not act on that reminder:', error);
  }
}
