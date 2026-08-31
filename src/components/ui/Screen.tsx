import { StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Surface } from '@/components/ui/Surface';

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
    <Surface
      ramp="page"
      style={[
        styles.root,
        {
          paddingTop: insets.top,
          paddingBottom: edgeToEdgeBottom ? 0 : insets.bottom,
          // Only the safe-area insets. The gutter lives on each screen's
          // scrolling content instead — a scroll view clips to its bounds, so
          // padding out here would cut every card's shadow off at the edge.
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
        style,
      ]}
    >
      {children}
    </Surface>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
