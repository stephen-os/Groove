import { useId, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Chip } from '@/components/ui/Chip';
import { Text } from '@/components/ui/Text';
import { formatTime } from '@/lib/date';
import { borderAll, bevelSunken, colors, MIN_TOUCH_TARGET, radius, spacing } from '@/lib/theme';

// Quarter hours. Ninety-six entries in one list is a scroll you have to aim at;
// as an hour and then a quarter it is two taps and nothing moves under you.
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = [0, 15, 30, 45];

const pad = (n: number): string => String(n).padStart(2, '0');
const clock = (hour: number, minute: number): string => `${pad(hour)}:${pad(minute)}`;

/** '13' or '1 PM', whichever this device writes. */
const hourLabel = (hour: number): string =>
  new Date(2000, 0, 1, hour).toLocaleTimeString(undefined, { hour: 'numeric' });

interface TimeFieldProps {
  label: string;
  /** 'HH:MM', or null for no particular time. */
  value: string | null;
  onChange: (value: string | null) => void;
  error?: string | undefined;
}

/**
 * Picks a time of day, to the quarter hour.
 *
 * Typing it was the previous design and it could be typed wrong — '7:00',
 * '25:00', '7pm' — so the form carried a format check and an error message for
 * a mistake the input itself invited. Choosing from the hours that exist
 * removes the failure rather than reporting it.
 *
 * The grid opens in place rather than in a modal: it is part of a form being
 * filled in, and a sheet over the top hides the answers already given.
 */
export function TimeField({ label, value, onChange, error }: TimeFieldProps) {
  const labelId = useId();
  const [open, setOpen] = useState(false);

  const hour = value === null ? null : Number.parseInt(value.slice(0, 2), 10);
  const minute = value === null ? 0 : Number.parseInt(value.slice(3), 10);

  const clear = (): void => {
    onChange(null);
    setOpen(false);
  };

  return (
    <View style={styles.group}>
      <Text variant="caption" tone="muted" nativeID={labelId}>
        {label}
      </Text>

      <Pressable
        onPress={() => setOpen((was) => !was)}
        accessibilityRole="button"
        accessibilityLabelledBy={labelId}
        accessibilityState={{ expanded: open }}
        accessibilityHint={error}
        style={[styles.field, error !== undefined && styles.fieldError]}
      >
        <Text style={value === null ? styles.placeholder : undefined}>
          {value === null ? 'Any time' : formatTime(value)}
        </Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </Pressable>

      {error !== undefined && (
        <Text variant="caption" tone="error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}

      {open && (
        <View style={styles.picker}>
          <Chip label="Any time" selected={value === null} onPress={clear} />

          <View style={styles.grid} accessibilityRole="radiogroup">
            {HOURS.map((option) => (
              <Chip
                key={option}
                label={hourLabel(option)}
                selected={hour === option}
                // Keeping the minutes already chosen: changing 7:30 to 8:30 is
                // one tap, not two.
                onPress={() => onChange(clock(option, minute))}
                style={styles.hour}
              />
            ))}
          </View>

          {hour !== null && (
            <View style={styles.row} accessibilityRole="radiogroup">
              {MINUTES.map((option) => (
                <Chip
                  key={option}
                  label={`:${pad(option)}`}
                  selected={minute === option}
                  onPress={() => {
                    onChange(clock(hour, option));
                    setOpen(false);
                  }}
                  accessibilityLabel={`${option} minutes past`}
                  style={styles.minute}
                />
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.xs },
  field: {
    ...bevelSunken,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: MIN_TOUCH_TARGET,
    backgroundColor: colors.bgAlt,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
  },
  // See TextField: a per-edge bevel beats `borderColor`, so this had no effect.
  fieldError: borderAll(colors.error),
  placeholder: { color: colors.muted },
  picker: { gap: spacing.sm, paddingTop: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  // Four across, so a '12 AM' label fits without the cell dropping under the
  // 48dp minimum on a narrow phone.
  hour: { flexBasis: '22%', flexGrow: 1 },
  minute: { flexGrow: 1 },
});
