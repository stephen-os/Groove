import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { HabitCheckRow } from '@/components/pages/habit/HabitCheckRow';

// The row is the app's most-used control and the one most likely to be wrong in
// a way nothing catches: it is shared by Today and the history editor, which ask
// it to mean different things about different days.
//
// `render` is awaited — React Native Testing Library 14 renders concurrently and
// returns a promise. Forgetting the await gives "`render` function has not been
// called" from every query, which reads like a setup problem rather than a
// missing await.

type Props = Parameters<typeof HabitCheckRow>[0];

const row = (overrides: Partial<Props> = {}) =>
  render(
    <HabitCheckRow
      name="Gym"
      schedule="Mon Tue Wed Thu"
      icon="barbell-outline"
      tint="#5bd88a"
      done={false}
      skipped={false}
      onToggle={jest.fn()}
      onSkip={jest.fn()}
      {...overrides}
    />
  );

const checkbox = () => screen.getByRole('checkbox', { name: 'Gym' });

describe('HabitCheckRow', () => {
  it('announces itself as a checkbox carrying the habit name', async () => {
    await row();
    expect(checkbox()).toBeTruthy();
  });

  it('reports being ticked through its state, not only its colour', async () => {
    await row({ done: true });
    expect(checkbox().props.accessibilityState.checked).toBe(true);
  });

  it('shows the schedule when there is no pace to show', async () => {
    await row();
    expect(screen.getByText('Mon Tue Wed Thu')).toBeTruthy();
  });

  it('prefers the pace over the schedule for a flexible habit', async () => {
    await row({ pace: '1/3 this week · on track' });
    expect(screen.getByText('1/3 this week · on track')).toBeTruthy();
    expect(screen.queryByText('Mon Tue Wed Thu')).toBeNull();
  });

  it('says it is skipped rather than showing a pace', async () => {
    await row({ skipped: true, pace: '1/3 this week · on track' });
    expect(screen.getByText('Skipped')).toBeTruthy();
  });

  it('does not respond when the day cannot be changed', async () => {
    const onToggle = jest.fn();
    await row({ disabled: true, onToggle });
    await fireEvent.press(checkbox());
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('ticks when pressed', async () => {
    const onToggle = jest.fn();
    await row({ onToggle });
    await fireEvent.press(checkbox());
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  // The bug this pins: History edits any past day through this row, so a
  // hard-coded "today" asked whether to skip a habit today while the screen was
  // showing the 12th, and TalkBack announced the action the same way.
  describe('the day it is asking about', () => {
    const alerts = () => jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    it('names a past day rather than calling it today', async () => {
      const alert = alerts();
      await row({ when: 'on 12 August' });
      await fireEvent(checkbox(), 'longPress');
      expect(alert.mock.calls[0]?.[0]).toBe('Skip Gym on 12 August?');
      alert.mockRestore();
    });

    it('says "today" when that is what it means', async () => {
      const alert = alerts();
      await row();
      await fireEvent(checkbox(), 'longPress');
      expect(alert.mock.calls[0]?.[0]).toBe('Skip Gym today?');
      alert.mockRestore();
    });

    it('offers skipping as a named action, not only as a gesture', async () => {
      await row({ when: 'on 12 August' });
      const actions = checkbox().props.accessibilityActions;
      expect(actions).toEqual([{ name: 'longpress', label: 'Skip on 12 August' }]);
    });
  });
});
