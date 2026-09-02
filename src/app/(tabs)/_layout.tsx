import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAccent } from '@/hooks/useAccent';
import { colors, spacing } from '@/lib/theme';

// The bar's own breathing room, above and below the icons. Slightly more below
// than above, because the gesture bar crowds that edge and an even split reads
// as bottom-heavy on the device even when it measures square.
const PAD_TOP = spacing.sm;
const PAD_BOTTOM = spacing.sm + spacing.xs;
/** Icon plus label, measured from the default tab bar. */
const CONTENT_HEIGHT = 48;

// Imported from 'expo-router/js-tabs', not from 'expo-router'. The root export
// is deprecated in SDK 57, and 'expo-router/unstable-native-tabs' is — as the
// name says — unstable. This is the supported, stable path.
export default function TabsLayout() {
  const accent = useAccent();
  // Overriding the bar's height replaces the safe-area padding it applies for
  // itself, so the inset has to be added back here or the labels sit under the
  // gesture bar.
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.fg,
        tabBarStyle: {
          backgroundColor: colors.bgAlt,
          borderTopColor: colors.border,
          height: CONTENT_HEIGHT + PAD_TOP + PAD_BOTTOM + insets.bottom,
          paddingTop: PAD_TOP,
          paddingBottom: PAD_BOTTOM + insets.bottom,
        },
        tabBarActiveTintColor: accent.base,
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
        }}
      />
      <Tabs.Screen
        name="habits"
        options={{
          title: 'Habits',
          tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} />,
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
