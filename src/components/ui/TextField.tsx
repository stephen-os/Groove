import { useId } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';
import { Text } from '@/components/ui/Text';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '@/lib/theme';

interface TextFieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  /** Shown under the field and announced as the field's error state. */
  error?: string;
}

/**
 * Labelled text input.
 *
 * React Native has no `htmlFor`, so the visible label is wired to the input with
 * `accessibilityLabelledBy` / `nativeID` — without it TalkBack reads the field
 * as an unlabelled edit box and the visible label as unrelated text.
 *
 * The border uses `borderStrong`, not `border`: this is a control boundary, and
 * WCAG 1.4.11 wants 3:1 for those. The decorative `border` token is deliberately
 * below that (see theme.ts).
 */
export function TextField({ label, error, multiline, ...rest }: TextFieldProps) {
  const labelId = useId();

  return (
    <View style={styles.field}>
      <Text variant="caption" tone="muted" nativeID={labelId}>
        {label}
      </Text>
      <TextInput
        accessibilityLabelledBy={labelId}
        // React Native has no equivalent of the web's `aria-invalid` — its
        // AccessibilityState is only disabled/selected/checked/busy/expanded. So
        // the error is conveyed two other ways: attached to this field as a hint
        // (read after the label when the field takes focus), and announced by
        // the live region below when it appears. Without both, the red border is
        // the only signal, which is colour-alone.
        accessibilityHint={error}
        multiline={multiline}
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          error !== undefined ? styles.inputError : null,
          multiline ? styles.multiline : null,
        ]}
        {...rest}
      />
      {error !== undefined && (
        <Text variant="caption" tone="error" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: spacing.xs,
  },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    backgroundColor: colors.bgAlt,
    borderColor: colors.borderStrong,
    color: colors.fg,
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    fontSize: 16,
  },
  inputError: {
    borderColor: colors.error,
  },
  multiline: {
    minHeight: MIN_TOUCH_TARGET * 2,
    textAlignVertical: 'top',
  },
});
