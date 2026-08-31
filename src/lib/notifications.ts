import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { DayKey } from './date';

// Local, on-device reminders only. No push service, no server, no token
// registration — nothing here talks to a network, which is what keeps a
// local-only app local-only.
//
// This module is the thin wrapper over expo-notifications. What *should* be
// scheduled is decided in reminder-plan.ts, which is pure; what is actually
// scheduled is reconciled in reminders.ts.

const CHANNEL_ID = 'reminders';

/** Identifies the action buttons attached to every habit reminder. */
const HABIT_CATEGORY = 'habit';
export const DONE_ACTION = 'done';
export const SNOOZE_ACTION = 'snooze';
export const SNOOZE_MINUTES = 15;

/**
 * What a reminder carries, so its response knows which day it belongs to.
 *
 * A type alias rather than an interface on purpose: expo-notifications types
 * `content.data` as `Record<string, unknown>`, and TypeScript gives an implicit
 * index signature to object type aliases but not to named interfaces.
 */
export type ReminderPayload = {
  habitId: number;
  day: DayKey;
};

/**
 * Reads the payload back off a notification.
 *
 * The OS round-trips `data` as unknown JSON, and a notification can outlive the
 * build that scheduled it — a reinstall or a downgrade can deliver a shape this
 * code no longer expects. Returning null rather than trusting the cast means a
 * stale notification is ignored instead of writing a completion for habit
 * `undefined`.
 */
export function readPayload(data: unknown): ReminderPayload | null {
  if (typeof data !== 'object' || data === null) return null;
  const { habitId, day } = data as Record<string, unknown>;
  if (typeof habitId !== 'number' || !Number.isInteger(habitId)) return null;
  if (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return { habitId, day };
}

/**
 * Configures notification presentation. Call once, as early as possible.
 *
 * Three separate things, all required on Android:
 * 1. The handler decides what happens when a notification fires while the app is
 *    foregrounded. Without it, the notification is delivered but never shown.
 * 2. The channel is what Android's settings UI exposes to the user.
 * 3. The category carries the Done and Snooze buttons. Done is the whole point
 *    of the chain — ticking a habit from the notification means never opening
 *    the app at 7am.
 */
export async function configureNotifications(): Promise<void> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  await Notifications.setNotificationCategoryAsync(HABIT_CATEGORY, [
    {
      identifier: DONE_ACTION,
      buttonTitle: 'Done',
      // Marking it done should not drag the whole app to the foreground.
      options: { opensAppToForeground: false },
    },
    {
      identifier: SNOOZE_ACTION,
      buttonTitle: `Snooze ${SNOOZE_MINUTES}m`,
      options: { opensAppToForeground: false },
    },
  ]);
}

/**
 * Returns whether the app may post notifications, asking the user if it hasn't yet.
 *
 * Only asks once — after a denial, `canAskAgain` is false and calling
 * `requestPermissionsAsync` again does nothing on Android, so re-prompting would
 * just be a no-op the caller mistakes for a fresh refusal. From then on the user
 * has to change it in system settings, which is what the settings screen says.
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * Schedules one alert and returns its id, or null if it could not be placed.
 *
 * Null rather than throwing: a missing reminder must never cost the user the
 * habit they were saving, and a resync that gives up half way would leave the
 * record disagreeing with reality.
 */
export async function scheduleAlert(
  title: string,
  body: string,
  date: Date,
  payload: ReminderPayload
): Promise<string | null> {
  if (date.getTime() <= Date.now()) return null;

  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: payload,
        categoryIdentifier: HABIT_CATEGORY,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        channelId: CHANNEL_ID,
      },
    });
  } catch (error) {
    console.warn('Failed to schedule reminder:', error);
    return null;
  }
}

/** Cancels specific alerts. Safe to call with ids the OS no longer knows. */
export async function cancelAlerts(notificationIds: readonly string[]): Promise<void> {
  await Promise.all(
    notificationIds.map(async (id) => {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch (error) {
        // Already fired, already cancelled, or lost to a reinstall. There is
        // nothing to recover and nothing the user needs to know.
        console.warn('Failed to cancel reminder:', error);
      }
    })
  );
}

/** Clears every pending alert this app owns, before a full resync rebuilds them. */
/**
 * Clears alerts that have already been delivered and are sitting in the shade.
 *
 * Cancelling only removes what has not fired yet. A reminder that arrived at
 * 07:00 stays in the notification drawer with its Done button until it is swiped
 * away — so ticking the habit in the app left a notification behind offering to
 * tick a habit that was already done.
 *
 * Failures are swallowed one at a time: an id the system has already forgotten
 * is the normal case, not an error.
 */
export async function dismissAlerts(notificationIds: readonly string[]): Promise<void> {
  for (const id of notificationIds) {
    try {
      await Notifications.dismissNotificationAsync(id);
    } catch (error) {
      console.warn('Failed to dismiss a delivered reminder:', error);
    }
  }
}

export async function cancelAllAlerts(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.warn('Failed to clear reminders:', error);
  }
}
