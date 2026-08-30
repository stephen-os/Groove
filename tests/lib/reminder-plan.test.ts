import { describe, expect, it } from 'vitest';
import { EVERY_DAY } from '@/lib/date';
import type { Completion } from '@/lib/db/completions';
import type { Habit } from '@/lib/db/habits';
import { planAlerts } from '@/lib/reminder-plan';
import { indexCompletions } from '@/lib/schedule';

// 2026-08-31 is a Monday. "now" is always local, built from components, so the
// suite behaves the same in any timezone.
const MON = '2026-08-31';
const TUE = '2026-09-01';
const at = (day: string, hour: number, minute = 0): Date => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute);
};

const MON_TO_THU = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4);

let nextId = 1;
const habit = (overrides: Partial<Habit> = {}): Habit => ({
  id: nextId++,
  profileId: 1,
  name: 'Brush teeth',
  icon: '',
  color: '',
  scheduleKind: 'daily',
  weekdayMask: EVERY_DAY,
  targetCount: 1,
  dueTime: '07:00',
  remindEnabled: true,
  followUps: 3,
  targetPct: 80,
  startsOn: '2026-01-01',
  archivedAt: null,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

const done = (habitId: number, days: readonly string[]): Completion[] =>
  days.map((day, index) => ({
    id: habitId * 1000 + index,
    habitId,
    day,
    status: 'done' as const,
    doneAt: 0,
  }));

const skip = (habitId: number, days: readonly string[]): Completion[] =>
  days.map((day, index) => ({
    id: habitId * 100_000 + index,
    habitId,
    day,
    status: 'skipped' as const,
    doneAt: 0,
  }));

const plan = (
  habits: readonly Habit[],
  completions: readonly Completion[],
  now: Date,
  horizon = 7
) => planAlerts(habits, indexCompletions(completions), now, horizon, 400);

describe('planAlerts', () => {
  it('places nothing when no habit wants a reminder', () => {
    const teeth = habit({ remindEnabled: false });
    expect(plan([teeth], [], at(MON, 6))).toHaveLength(0);
  });

  it('places nothing for a habit with no due time', () => {
    const teeth = habit({ dueTime: null });
    expect(plan([teeth], [], at(MON, 6))).toHaveLength(0);
  });

  it('places the due-time alert and every follow-up', () => {
    const alerts = plan([habit()], [], at(MON, 6), 1);
    expect(alerts).toHaveLength(4);
    expect(alerts.map((alert) => alert.sequence)).toEqual([0, 1, 2, 3]);
    expect(alerts[0].fireAt).toBe(at(MON, 7).getTime());
    expect(alerts[1].fireAt).toBe(at(MON, 7, 15).getTime());
    expect(alerts[3].fireAt).toBe(at(MON, 8).getTime());
  });

  it('names the first alert plainly and the follow-ups as still outstanding', () => {
    const alerts = plan([habit({ name: 'Gym' })], [], at(MON, 6), 1);
    expect(alerts[0].title).toBe('Gym');
    expect(alerts[1].title).toBe('Still: Gym');
  });

  it('drops alerts whose moment has already passed', () => {
    // 07:20 — the 07:00 and 07:15 alerts are behind us; 07:30 and 08:00 remain.
    const alerts = plan([habit()], [], at(MON, 7, 20), 1);
    expect(alerts.map((alert) => alert.sequence)).toEqual([2, 3]);
  });

  it('places nothing at all for a day already gone', () => {
    expect(plan([habit()], [], at(MON, 23), 1)).toHaveLength(0);
  });

  it('skips a habit already ticked for the day', () => {
    const teeth = habit();
    expect(plan([teeth], done(teeth.id, [MON]), at(MON, 6), 1)).toHaveLength(0);
  });

  it('still covers the following days when today is done', () => {
    const teeth = habit();
    const alerts = plan([teeth], done(teeth.id, [MON]), at(MON, 6), 2);
    expect(alerts).toHaveLength(4);
    expect(alerts.every((alert) => alert.day === TUE)).toBe(true);
  });

  it('follows the weekday mask across the horizon', () => {
    const gym = habit({ weekdayMask: MON_TO_THU, name: 'Gym' });
    const alerts = plan([gym], [], at(MON, 6), 7);
    const days = [...new Set(alerts.map((alert) => alert.day))].sort();
    // Mon 31 Aug through Thu 3 Sep. Friday onwards is not a gym day.
    expect(days).toEqual(['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03']);
  });

  it('stops nagging a flexible habit once its target is met', () => {
    const gym = habit({ scheduleKind: 'weekly', targetCount: 2, name: 'Gym' });
    const alerts = plan([gym], done(gym.id, [MON, TUE]), at(TUE, 20), 7);
    // The week runs to Sunday 6 Sep; the target is met, so nothing until the
    // next week opens on Monday 7 Sep, which is outside a 7-day horizon here.
    expect(alerts.every((alert) => alert.day >= '2026-09-07')).toBe(true);
  });

  it('keeps nagging a flexible habit that is still short', () => {
    const gym = habit({ scheduleKind: 'weekly', targetCount: 3, name: 'Gym' });
    const alerts = plan([gym], done(gym.id, [MON]), at(TUE, 6), 1);
    expect(alerts).toHaveLength(4);
    expect(alerts.every((alert) => alert.day === TUE)).toBe(true);
  });

  it('returns alerts soonest first', () => {
    const early = habit({ dueTime: '06:00', name: 'Early' });
    const late = habit({ dueTime: '21:00', name: 'Late' });
    const alerts = plan([late, early], [], at(MON, 5), 2);
    const times = alerts.map((alert) => alert.fireAt);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('truncates to the cap, keeping the soonest', () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      habit({ name: `Habit ${index}`, dueTime: '07:00' })
    );
    const capped = planAlerts(many, indexCompletions([]), at(MON, 6), 7, 10);
    expect(capped).toHaveLength(10);
    expect(capped.every((alert) => alert.day === MON)).toBe(true);
  });

  it('carries the habit and day so a response knows what it refers to', () => {
    const teeth = habit();
    const [alert] = plan([teeth], [], at(MON, 6), 1);
    expect(alert.habitId).toBe(teeth.id);
    expect(alert.day).toBe(MON);
  });

  it('ignores a habit that has not started yet', () => {
    const future = habit({ startsOn: '2027-01-01' });
    expect(plan([future], [], at(MON, 6), 7)).toHaveLength(0);
  });

  it('ignores an archived habit', () => {
    const retired = habit({ archivedAt: at(MON, 0).getTime() });
    expect(plan([retired], [], at(MON, 6), 7)).toHaveLength(0);
  });

  it('says nothing about a day that was skipped', () => {
    const teeth = habit();
    expect(plan([teeth], skip(teeth.id, [MON]), at(MON, 6), 1)).toHaveLength(0);
  });

  it('honours a habit that only wants one notification', () => {
    const alerts = plan([habit({ followUps: 0 })], [], at(MON, 6), 1);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].sequence).toBe(0);
  });

  it('honours a habit that wants a single follow-up', () => {
    const alerts = plan([habit({ followUps: 1 })], [], at(MON, 6), 1);
    expect(alerts.map((alert) => alert.fireAt)).toEqual([
      at(MON, 7).getTime(),
      at(MON, 7, 15).getTime(),
    ]);
  });

  // The point of a day being the unit: an 11:30pm habit must not chase you at
  // half past midnight about yesterday.
  it('never lets a chain run past midnight into the next day', () => {
    const late = habit({ dueTime: '23:30', followUps: 3 });
    const alerts = plan([late], [], at(MON, 20), 1);
    expect(alerts.map((alert) => alert.sequence)).toEqual([0, 1]);
    expect(alerts.every((alert) => alert.fireAt < at(TUE, 0).getTime())).toBe(true);
  });

  it('places a late habit no follow-ups at all when none fit the day', () => {
    const late = habit({ dueTime: '23:55', followUps: 3 });
    expect(plan([late], [], at(MON, 20), 1)).toHaveLength(1);
  });
});
