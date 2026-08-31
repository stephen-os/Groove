import { useEffect, useState } from 'react';
import { AppState, StyleSheet, Text as RNText, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { getDatabase } from '@/lib/db/client';
import { configureNotifications } from '@/lib/notifications';
import { handleReminderResponse, syncReminders } from '@/lib/reminders';
import { colors, fontSize, spacing } from '@/lib/theme';

// Hold the splash screen until the database is open and built, so the first
// screen never renders against tables that aren't there yet. The catch is
// required: this rejects if the splash has already auto-hidden, which is not an
// error worth crashing over.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

type Startup = { status: 'loading' } | { status: 'ready' } | { status: 'failed'; message: string };

export default function RootLayout() {
  const [startup, setStartup] = useState<Startup>({ status: 'loading' });

  useEffect(() => {
    const prepare = async (): Promise<void> => {
      try {
        // Opening the database builds the schema if it is missing or out of
        // date. If this throws, the app has no usable storage and there is
        // nothing sensible to render.
        await getDatabase();
        await configureNotifications();
        setStartup({ status: 'ready' });
      } catch (error) {
        console.error('Startup failed:', error);
        setStartup({
          status: 'failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      } finally {
        await SplashScreen.hideAsync().catch(() => undefined);
      }
    };
    void prepare();
  }, []);

  // Reminders live on a rolling horizon that only extends a week out, so it has
  // to be refilled regularly. Every return to the foreground is the natural
  // moment: it is frequent enough to keep the horizon from running dry, and it
  // costs nothing when there is nothing to change.
  useEffect(() => {
    if (startup.status !== 'ready') return;

    void syncReminders();

    const appState = AppState.addEventListener('change', (next) => {
      if (next === 'active') void syncReminders();
    });

    // Fires when a reminder's Done or Snooze button is tapped, including while
    // the app is in the background.
    const responses = Notifications.addNotificationResponseReceivedListener((response) => {
      void handleReminderResponse(response);
    });

    return () => {
      appState.remove();
      responses.remove();
    };
  }, [startup.status]);

  if (startup.status === 'loading') return null;

  // Rendered without any of the app's own components on purpose: this is what
  // shows when storage itself failed, so it must not depend on anything that
  // could be part of the failure. The palette is a plain module, so using it
  // here is safe.
  if (startup.status === 'failed') {
    return (
      <View style={styles.fatal}>
        <RNText style={styles.fatalTitle}>The app could not start</RNText>
        <RNText style={styles.fatalBody}>
          Its local database failed to open. Reinstalling clears it, which also erases local
          data — export a backup first if you can.
        </RNText>
        <RNText style={styles.fatalDetail}>{startup.message}</RNText>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        {/* The app is dark only, so the status bar icons are always light. */}
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.fg,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="habit/new" options={{ presentation: 'modal', title: 'New habit' }} />
          <Stack.Screen name="habit/[id]" options={{ presentation: 'modal', title: 'Edit habit' }} />
          <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fatal: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.bg,
  },
  fatalTitle: { color: colors.fg, fontSize: fontSize.lg, fontWeight: '600' },
  fatalBody: { color: colors.muted, fontSize: fontSize.body, lineHeight: 22 },
  fatalDetail: { color: colors.error, fontSize: fontSize.sm },
});
