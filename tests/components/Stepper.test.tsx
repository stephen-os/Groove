import { fireEvent, render, screen } from '@testing-library/react-native';
import { Stepper } from '@/components/ui/Stepper';

// The Stepper's doc promises that "nothing outside min..max can leave this
// control". It did not hold: a count of twenty carried over from Monthly, where
// it is reasonable, into Weekly, where seven days is the ceiling — because the
// clamp only ran inside the arrow handlers and never looked at the value coming
// in. That habit then sat at a permanent F for weeks it had completed perfectly.

// Awaited inside, so no two renders are ever in flight at once. Returning the
// promise for the caller to await left overlapping `act()` scopes and queries
// that read the previous test's tree.
const stepper = async (props: Partial<Parameters<typeof Stepper>[0]> = {}) => {
  const onChange = jest.fn();
  await render(
    <Stepper label="How many times a week" value={3} onChange={onChange} min={1} max={7} {...props} />
  );
  return onChange;
};

/**
 * A control inside the stepper.
 *
 * `includeHiddenElements` because the whole stepper is one accessibility
 * element now, so its arrows and its number are deliberately not exposed
 * separately — which is the point on a device and an inconvenience in a test.
 */
const inside = (label: string) =>
  screen.getByLabelText(label, { includeHiddenElements: true });

describe('Stepper', () => {
  it('shows the value it was given', async () => {
    await stepper({ value: 4 });
    expect(screen.getByText('4', { includeHiddenElements: true })).toBeTruthy();
  });

  it('is adjustable, so it can be swiped rather than aimed at', async () => {
    await stepper();
    // The arrows are small; the adjustable role is how a screen-reader user
    // changes the number without having to hit them.
    expect(screen.getByRole('adjustable')).toBeTruthy();
  });

  it('reports its bounds and its value together', async () => {
    await stepper({ value: 3, unit: 'times a week' });
    expect(screen.getByRole('adjustable').props.accessibilityValue).toMatchObject({
      min: 1,
      max: 7,
      now: 3,
      text: '3 times a week',
    });
  });

  it('goes up and down one at a time', async () => {
    const onChange = await stepper({ value: 3 });
    await fireEvent.press(inside('Increase How many times a week'));
    expect(onChange).toHaveBeenCalledWith(4);

    await fireEvent.press(inside('Decrease How many times a week'));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('will not step past the top', async () => {
    const onChange = await stepper({ value: 7 });
    const up = inside('Increase How many times a week');
    expect(up.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(up);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('will not step below the bottom', async () => {
    const onChange = await stepper({ value: 1 });
    const down = inside('Decrease How many times a week');
    expect(down.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(down);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('answers a swipe the same way it answers the arrows', async () => {
    const onChange = await stepper({ value: 3 });
    const control = screen.getByRole('adjustable');
    await fireEvent(control, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenCalledWith(4);
    await fireEvent(control, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('clamps a typed number rather than taking it', async () => {
    const onChange = await stepper({ value: 3 });
    // Tapping the number turns it into an input; ninety-nine a week is not a
    // thing, so seven is what comes out.
    await fireEvent.press(screen.getByText('3', { includeHiddenElements: true }));
    const input = screen.getByDisplayValue('3', { includeHiddenElements: true });
    await fireEvent.changeText(input, '99');
    await fireEvent(input, 'submitEditing');
    expect(onChange).toHaveBeenCalledWith(7);
  });

  it('keeps a typed number that is in range', async () => {
    const onChange = await stepper({ value: 3 });
    await fireEvent.press(screen.getByText('3', { includeHiddenElements: true }));
    const input = screen.getByDisplayValue('3', { includeHiddenElements: true });
    await fireEvent.changeText(input, '5');
    await fireEvent(input, 'submitEditing');
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('ignores an empty field rather than falling to the minimum', async () => {
    const onChange = await stepper({ value: 3 });
    await fireEvent.press(screen.getByText('3', { includeHiddenElements: true }));
    const input = screen.getByDisplayValue('3', { includeHiddenElements: true });
    await fireEvent.changeText(input, '');
    await fireEvent(input, 'submitEditing');
    expect(onChange).not.toHaveBeenCalled();
  });
});
