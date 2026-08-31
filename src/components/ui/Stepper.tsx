import { useId, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/components/ui/Text';
import {
  bevelSunken,
  colors,
  fontSize,
  MIN_TOUCH_TARGET,
  radius,
  spacing,
} from '@/lib/theme';

interface StepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** Read after the number, so "3 sessions" rather than a bare "3". */
  unit?: string;
}

/**
 * A number you can nudge or type.
 *
 * A row of chips per value stops working the moment the range is more than a
 * handful wide, and it makes every value look equally deliberate when really
 * one is being adjusted from another. Arrows carry that relationship; the
 * middle stays a text input for anyone who knows the number they want.
 *
 * Bounds are enforced here rather than trusted from the caller: the arrows
 * disable at each end, and a typed number is clamped on commit. Nothing outside
 * `min`..`max` can leave this control.
 */
export function Stepper({ label, value, onChange, min, max, unit }: StepperProps) {
  const labelId = useId();
  // Non-null only while being typed into. Holding the raw string means a
  // half-typed value is never round-tripped through Number and clamped out from
  // under the cursor — clearing the field to retype would otherwise snap to min.
  const [draft, setDraft] = useState<string | null>(null);

  const step = (by: number): void => {
    const next = Math.min(max, Math.max(min, value + by));
    if (next !== value) onChange(next);
  };

  const commit = (): void => {
    if (draft === null) return;
    const parsed = Number.parseInt(draft, 10);
    setDraft(null);
    if (Number.isNaN(parsed)) return;
    onChange(Math.min(max, Math.max(min, parsed)));
  };

  return (
    <View style={styles.group}>
      <Text variant="caption" tone="muted" nativeID={labelId}>
        {label}
      </Text>
      <View
        style={styles.field}
        // The adjustable role is what makes this swipeable under TalkBack, which
        // is how a screen-reader user changes a number without hunting for two
        // small arrows.
        accessibilityRole="adjustable"
        accessibilityLabelledBy={labelId}
        accessibilityValue={{ min, max, now: value, text: unit ? `${value} ${unit}` : undefined }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          step(event.nativeEvent.actionName === 'increment' ? 1 : -1);
        }}
      >
        <Arrow direction="down" label={`Decrease ${label}`} onPress={() => step(-1)} disabled={value <= min} />
        <Pressable style={styles.centre} onPress={() => setDraft(String(value))} accessibilityRole="button">
          {draft === null ? (
            <Text style={styles.value}>{value}</Text>
          ) : (
            <TextInput
              value={draft}
              onChangeText={setDraft}
              onBlur={commit}
              onSubmitEditing={commit}
              autoFocus
              selectTextOnFocus
              keyboardType="number-pad"
              returnKeyType="done"
              maxLength={String(max).length}
              style={[styles.value, styles.input]}
            />
          )}
        </Pressable>
        <Arrow direction="up" label={`Increase ${label}`} onPress={() => step(1)} disabled={value >= max} />
      </View>
    </View>
  );
}

function Arrow({
  direction,
  label,
  onPress,
  disabled,
}: {
  direction: 'up' | 'down';
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.arrow, pressed && styles.arrowPressed]}
    >
      <Ionicons
        name={direction === 'up' ? 'chevron-forward' : 'chevron-back'}
        size={22}
        // Dimmed rather than hidden at the ends: a control that changes shape as
        // you use it is harder to aim at than one that just stops responding.
        color={disabled ? colors.border : colors.fg}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Centred, not left-aligned: a control this narrow parked against the left
  // margin of a form of full-width fields reads as something that failed to
  // stretch rather than as something sized to its content.
  group: { gap: spacing.xs, alignItems: 'center' },
  field: {
    ...bevelSunken,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgAlt,
    borderRadius: radius.sm,
  },
  arrow: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowPressed: { opacity: 0.5 },
  centre: {
    minWidth: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  value: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: colors.fg,
    textAlign: 'center',
    minWidth: spacing.lg,
  },
  input: { padding: 0 },
});
