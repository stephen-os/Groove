import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router/js-tabs';
import { useTheme } from '@/components/layout/ThemeProvider';

// Imported from 'expo-router/js-tabs', not from 'expo-router'. The root export
// is deprecated in SDK 57, and 'expo-router/unstable-native-tabs' is — as the
// name says — unstable. This is the supported, stable path.
export default function TabsLayout() {
  const { theme } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.fg,
        tabBarStyle: { backgroundColor: theme.bgAlt, borderTopColor: theme.border },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.muted,
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Items',
          // The icon is decorative — the tab's accessible name comes from its
          // title, and the active tab is announced as selected by the tab role.
          tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} />,
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
