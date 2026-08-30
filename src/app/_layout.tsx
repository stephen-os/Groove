import { useEffect, useState } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '@/components/layout/ThemeProvider';
import { getDatabase } from '@/lib/db/client';
import { configureNotifications } from '@/lib/notifications';

// Hold the splash screen until the database has opened and migrated, so the
// first screen never renders against a schema that isn't there yet. The catch is
// required: this rejects if the splash has already auto-hidden, which is not an
// error worth crashing over.
SplashScreen.preventAutoHideAsync().catch(() => undefined);

type Startup = { status: 'loading' } | { status: 'ready' } | { status: 'failed'; message: string };

export default function RootLayout() {
  const [startup, setStartup] = useState<Startup>({ status: 'loading' });

  useEffect(() => {
    const prepare = async (): Promise<void> => {
      try {
        // Opening the database runs any pending migrations. If this throws, the
        // app has no usable storage and there is nothing sensible to render.
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

  if (startup.status === 'loading') return null;

  // Deliberately unthemed and dependency-free: this renders when the database —
  // which the theme preference is read from — is the thing that failed. A blank
  // screen here would leave no way to tell a crash from a slow start.
  if (startup.status === 'failed') {
    return (
      <View style={styles.fatal}>
        <RNText style={styles.fatalTitle}>The app could not start</RNText>
        <RNText style={styles.fatalBody}>
          Its local database failed to open. Reinstalling clears it, which also
          erases local data — export a backup first if you can.
        </RNText>
        <RNText style={styles.fatalDetail}>{startup.message}</RNText>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppStack />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Split from RootLayout because it consumes the theme, which means it has to sit
// inside ThemeProvider rather than alongside it.
function AppStack() {
  const { theme, name } = useTheme();

  return (
    <>
      {/* Status bar icons invert with the theme; on a dark background they must
          be light, or the clock disappears. */}
      <StatusBar style={name === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.bg },
          headerTintColor: theme.fg,
          contentStyle: { backgroundColor: theme.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="item/new" options={{ presentation: 'modal', title: 'New item' }} />
        <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
      </Stack>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fatal: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 12,
    backgroundColor: '#101011',
  },
  fatalTitle: { color: '#ededf0', fontSize: 20, fontWeight: '600' },
  fatalBody: { color: '#9b9ba3', fontSize: 16, lineHeight: 22 },
  fatalDetail: { color: '#f98a8a', fontSize: 13 },
});
