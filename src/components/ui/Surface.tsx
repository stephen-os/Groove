import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAccent } from '@/hooks/useAccent';
import { GRADIENT_END, GRADIENT_START, gradients } from '@/lib/theme';

interface SurfaceProps {
  children?: React.ReactNode;
  /** Which ramp to lay down. 'accent' follows whatever is chosen in Settings. */
  ramp?: keyof typeof gradients | 'accent';
  style?: StyleProp<ViewStyle>;
}

/**
 * A view lit by one of the palette's gradients.
 *
 * Everything that carries light goes through here rather than through a style,
 * because React Native's own `experimental_backgroundImage` crashes the process
 * from inside `BackgroundImageDrawable.draw` when a view carrying it re-renders
 * quickly — stepping through calendar dates was enough to do it reliably.
 *
 * `expo-linear-gradient` renders a real view, so borderRadius, boxShadow and
 * layout all behave exactly as they would on a plain `View`.
 */
export function Surface({ children, ramp = 'surface', style }: SurfaceProps) {
  const accent = useAccent();
  const stops = ramp === 'accent' ? accent.gradient : gradients[ramp];

  return (
    <LinearGradient
      colors={[...stops]}
      start={GRADIENT_START}
      end={GRADIENT_END}
      style={StyleSheet.flatten(style)}
    >
      {children}
    </LinearGradient>
  );
}
