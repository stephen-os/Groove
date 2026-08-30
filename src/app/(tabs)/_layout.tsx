import { Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Link } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { colors, MIN_TOUCH_TARGET, spacing } from '@/lib/theme';

// Imported from 'expo-router/js-tabs', not from 'expo-router'. The root export
// is deprecated in SDK 57, and 'expo-router/unstable-native-tabs' is — as the
// name says — unstable. This is the supported, stable path.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.fg,
        tabBarStyle: { backgroundColor: colors.bgAlt, borderTopColor: colors.border },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          // The icon is decorative — the tab's accessible name comes from its
          // title, and the active tab is announced as selected by the tab role.
          tabBarIcon: ({ color, size }) => <Ionicons name="today" size={size} color={color} />,
          headerRight: () => (
            <Link href="/habits" asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Manage habits"
                style={styles.headerButton}
              >
                <Ionicons name="create-outline" size={22} color={colors.accent} />
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: 'Analytics',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  // An icon on its own is a 22dp target; the padding is what makes it tappable.
  headerButton: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: spacing.sm,
  },
});
