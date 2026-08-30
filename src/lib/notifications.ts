import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Local, on-device reminders only. No push service, no server, no token
// registration — nothing here talks to a network, which is what keeps a
// local-only app local-only.

const CHANNEL_ID = 'reminders';

/**
 * Configures notification presentation. Call once, as early as possible.
 *
 * Two separate things, both required on Android:
 * 1. The handler decides what happens when a notification fires while the app is
 *    foregrounded. Without it, the notification is delivered but never shown.
 * 2. The channel is what Android's settings UI exposes to the user. Created
 *    up front so the app's notification settings look right before the first
 *    reminder is ever scheduled.
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
}

/**
 * Returns whether the app may post notifications, asking the user if it hasn't yet.
 *
 * Only asks once — after a denial, `canAskAgain` is false and calling
 * `requestPermissionsAsync` again does nothing on Android, so re-prompting would
 * just be a no-op the caller mistakes for a fresh refusal. From then on the user
 * has to change it in system settings, which is what the settings screen says.
 */
async function ensureNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.granted;
}

/**
 * Schedules a one-off reminder and returns its id, or null if it couldn't be set.
 *
 * Null rather than throwing: a missing reminder must never cost the user the
 * item they were saving. The caller stores whatever it gets — an item with a
 * null notification id simply has no reminder attached.
 */
export async function scheduleReminder(
  title: string,
  body: string,
  date: Date
): Promise<string | null> {
  // A trigger in the past fires immediately on some Android versions and is
  // dropped on others. Neither is what the user asked for, so refuse it here
  // where the reason is obvious.
  if (date.getTime() <= Date.now()) return null;

  const granted = await ensureNotificationPermission();
  if (!granted) return null;

  try {
    return await Notifications.scheduleNotificationAsync({
      content: { title, body },
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

/** Cancels a scheduled reminder. Safe to call with an id the OS no longer knows. */
export async function cancelReminder(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    // Already fired, already cancelled, or lost to a reinstall. There is nothing
    // to recover and nothing the user needs to know.
    console.warn('Failed to cancel reminder:', error);
  }
}
