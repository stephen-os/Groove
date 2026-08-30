import { Text as RNText } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { isEmoji } from '@/lib/habit-style';

interface HabitFaceProps {
  /** An Ionicons name, or an emoji. */
  icon: string;
  /** Applied to a glyph only — an emoji brings its own colour. */
  tint: string;
  size?: number;
}

/**
 * A habit's face: a tinted glyph or an emoji, whichever it was given.
 *
 * Both live in one column, so this is the one place that decides which is
 * which. Rendering an emoji through Ionicons would silently draw nothing —
 * the font has no glyph for it — so the branch has to happen before the icon
 * component is reached, not inside it.
 */
export function HabitFace({ icon, tint, size = 22 }: HabitFaceProps) {
  if (isEmoji(icon)) {
    // Line height matched to the size so the emoji sits centred in its bubble
    // rather than riding on a text baseline.
    return <RNText style={{ fontSize: size, lineHeight: size + 2 }}>{icon}</RNText>;
  }
  return <Ionicons name={icon as never} size={size} color={tint} />;
}
