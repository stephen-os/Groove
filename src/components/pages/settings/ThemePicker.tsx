import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme, type ThemePreference } from '@/components/layout/ThemeProvider';
import { Text } from '@/components/ui/Text';
import { MIN_TOUCH_TARGET, radius, spacing } from '@/lib/theme';

const OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * Segmented control for the theme preference.
 *
 * Only the settings screen uses it, so it lives under components/pages/settings
 * rather than in ui/. Promote it if a second screen ever needs it.
 *
 * `accessibilityRole="radio"` with `checked` is what makes the selection
 * audible: the selected segment is otherwise distinguished by colour alone,
 * which a screen-reader user cannot perceive and a colour-blind user may not.
 */
export function ThemePicker() {
  const { theme, preference, setPreference } = useTheme();

  return (
    <View style={styles.row} accessibilityRole="radiogroup">
      {OPTIONS.map((option) => {
        const selected = preference === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => setPreference(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            style={[
              styles.segment,
              {
                backgroundColor: selected ? theme.accent : 'transparent',
                borderColor: selected ? theme.accent : theme.borderStrong,
              },
            ]}
          >
            <Text style={{ color: selected ? theme.onAccent : theme.fg, fontWeight: '600' }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
