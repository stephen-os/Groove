import { StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, gradients, spacing } from '@/lib/theme';

/** The gutter every screen keeps between its content and the display edge. */
const GUTTER = spacing.md;

interface ScreenProps {
  children: React.ReactNode;
  /**
   * Skip bottom inset padding. Set this on tab screens, where the tab bar
   * already sits in the bottom inset and padding it twice leaves a visible gap.
   */
  edgeToEdgeBottom?: boolean;
  style?: ViewStyle;
}

/**
 * The outer frame of every screen: background plus safe-area padding.
 *
 * Insets are applied as padding rather than using SafeAreaView so the background
 * colour still extends under the status bar and navigation gestures. Android
 * draws edge-to-edge by default from SDK 57 on, which makes the system bars
 * transparent — a screen that stops short of them shows the wrong colour behind
 * the clock.
 */
export function Screen({ children, edgeToEdgeBottom = false, style }: ScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top,
          paddingBottom: edgeToEdgeBottom ? 0 : insets.bottom,
          // Added to the gutter rather than assigned over it. `paddingLeft` and
          // `paddingRight` beat `paddingHorizontal` whatever the order, so
          // setting them to a portrait phone's zero insets would silently
          // delete the gutter and run every card off both edges.
          paddingLeft: GUTTER + insets.left,
          paddingRight: GUTTER + insets.right,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    experimental_backgroundImage: gradients.page,
  },
});
