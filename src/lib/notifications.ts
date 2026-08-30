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

// Scheduling itself is deliberately absent for now. The template's one-off
// `scheduleReminder` does not fit the design Groove needs — a rolling horizon of
// per-day triggers, recorded so that ticking a habit can cancel exactly that
// day's chain — and a half-matching helper left lying here would only get called
// by mistake. It arrives with the scheduler, in its own module.
