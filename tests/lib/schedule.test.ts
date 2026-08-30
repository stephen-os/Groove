import { describe, expect, it } from 'vitest';
import { EVERY_DAY } from '@/lib/date';
import type { Completion } from '@/lib/db/completions';
import type { Habit, ScheduleKind } from '@/lib/db/habits';
import {
  archivedOn,
  countInRange,
  describeSchedule,
  habitsDueOn,
  indexCompletions,
  isActiveOn,
  isEmpty,
  monthRange,
  weekRange,
} from '@/lib/schedule';

// Calendar anchors used throughout. August 2026 starts on a Saturday, so
// 2026-08-31 is a Monday and the week it opens runs into September — which is
// exactly the boundary a week-range implementation gets wrong.
const MON = '2026-08-31';
const TUE = '2026-09-01';
const THU = '2026-09-03';
const FRI = '2026-09-04';
const SUN = '2026-09-06';

const MON_TO_THU = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4);

let nextId = 1;
const habit = (overrides: Partial<Habit> & { scheduleKind?: ScheduleKind } = {}): Habit => ({
  id: nextId++,
  profileId: 1,
  name: 'Habit',
  icon: '',
  color: '',
  sortOrder: 0,
  scheduleKind: 'daily',
  weekdayMask: EVERY_DAY,
  targetCount: 1,
  dueTime: null,
  remindEnabled: false,
  targetPct: 80,
  startsOn: '2026-01-01',
  archivedAt: null,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

const done = (habitId: number, days: readonly string[]): Completion[] =>
  days.map((day, index) => ({ id: habitId * 1000 + index, habitId, day, doneAt: 0 }));

describe('weekRange', () => {
  it('runs Monday to Sunday', () => {
    expect(weekRange(MON)).toEqual({ from: '2026-08-31', to: '2026-09-06' });
  });

  it('puts Sunday at the end of its week, not the start', () => {
    // The classic off-by-one: Date.getDay() calls Sunday 0, so a naive
    // implementation would open a new week here.
    expect(weekRange(SUN)).toEqual({ from: '2026-08-31', to: '2026-09-06' });
  });

  it('is the same range for every day inside it', () => {
    const expected = { from: '2026-08-31', to: '2026-09-06' };
    for (const day of [MON, TUE, THU, FRI, SUN]) {
      expect(weekRange(day)).toEqual(expected);
    }
  });

  it('spans a month boundary without splitting the week', () => {
    expect(weekRange(TUE).from).toBe('2026-08-31');
  });
});

describe('monthRange', () => {
  it('covers a 30-day month', () => {
    expect(monthRange('2026-09-15')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('covers a 31-day month', () => {
    expect(monthRange('2026-08-01')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('gets February right in a non-leap year', () => {
    expect(monthRange('2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('gets February right in a leap year', () => {
    expect(monthRange('2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});

describe('isActiveOn', () => {
  it('excludes days before the habit started', () => {
    const gym = habit({ startsOn: THU });
    expect(isActiveOn(gym, TUE)).toBe(false);
    expect(isActiveOn(gym, THU)).toBe(true);
    expect(isActiveOn(gym, FRI)).toBe(true);
  });

  it('excludes the archive day and everything after it', () => {
    const gym = habit({ archivedAt: new Date(2026, 8, 3).getTime() });
    expect(isActiveOn(gym, TUE)).toBe(true);
    expect(isActiveOn(gym, THU)).toBe(false);
    expect(isActiveOn(gym, FRI)).toBe(false);
  });

  it('reports the archive day as a local calendar day', () => {
    const gym = habit({ archivedAt: new Date(2026, 8, 3, 23, 45).getTime() });
    expect(archivedOn(gym)).toBe(THU);
  });

  it('has no archive day while active', () => {
    expect(archivedOn(habit())).toBeNull();
  });
});

describe('countInRange', () => {
  const days = new Set(['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-30']);

  it('counts only days inside the range, inclusive at both ends', () => {
    expect(countInRange(days, { from: '2026-08-31', to: '2026-09-01' })).toBe(2);
  });

  it('is zero for a habit with no completions', () => {
    expect(countInRange(undefined, { from: '2026-08-01', to: '2026-08-31' })).toBe(0);
  });
});

describe('habitsDueOn — daily', () => {
  it('shows a habit only on the weekdays its mask includes', () => {
    const gym = habit({ weekdayMask: MON_TO_THU, name: 'Gym' });
    const index = indexCompletions([]);

    expect(habitsDueOn([gym], index, MON).daily).toHaveLength(1);
    expect(habitsDueOn([gym], index, THU).daily).toHaveLength(1);
    expect(habitsDueOn([gym], index, FRI).daily).toHaveLength(0);
    expect(habitsDueOn([gym], index, SUN).daily).toHaveLength(0);
  });

  it('treats a single-bit mask as a fixed weekly day', () => {
    const laundry = habit({ weekdayMask: 1 << 0 }); // Sunday
    expect(habitsDueOn([laundry], indexCompletions([]), SUN).daily).toHaveLength(1);
    expect(habitsDueOn([laundry], indexCompletions([]), MON).daily).toHaveLength(0);
  });

  it('reports whether it is already ticked', () => {
    const teeth = habit();
    const index = indexCompletions(done(teeth.id, [MON]));
    expect(habitsDueOn([teeth], index, MON).daily[0].done).toBe(true);
    expect(habitsDueOn([teeth], index, TUE).daily[0].done).toBe(false);
  });

  it('stays visible once ticked, so the tick can be taken back', () => {
    const teeth = habit();
    const index = indexCompletions(done(teeth.id, [MON]));
    expect(habitsDueOn([teeth], index, MON).daily).toHaveLength(1);
  });

  it('hides a habit that has not started yet', () => {
    const gym = habit({ startsOn: FRI });
    expect(habitsDueOn([gym], indexCompletions([]), MON).daily).toHaveLength(0);
  });
});

describe('habitsDueOn — weekly', () => {
  const call = (targetCount: number, doneDays: readonly string[], day: string) => {
    const gym = habit({ scheduleKind: 'weekly', targetCount, name: 'Gym' });
    return habitsDueOn([gym], indexCompletions(done(gym.id, doneDays)), day).weekly;
  };

  it('appears every day while the target is unmet', () => {
    expect(call(3, [], MON)).toHaveLength(1);
    expect(call(3, [], FRI)).toHaveLength(1);
    expect(call(3, [], SUN)).toHaveLength(1);
  });

  it('reports progress through the week', () => {
    const [entry] = call(3, [MON, TUE], THU);
    expect(entry.count).toBe(2);
    expect(entry.target).toBe(3);
    expect(entry.done).toBe(false);
  });

  it('steps aside for the rest of the week once the target is met', () => {
    expect(call(3, [MON, TUE, THU], FRI)).toHaveLength(0);
  });

  it('stays visible on the day the target was met, so it can be undone', () => {
    const entries = call(3, [MON, TUE, THU], THU);
    expect(entries).toHaveLength(1);
    expect(entries[0].done).toBe(true);
    expect(entries[0].count).toBe(3);
  });

  it('comes back in the following week', () => {
    // Met on the week of 31 Aug; the next Monday opens a fresh week.
    expect(call(2, [MON, TUE], '2026-09-07')).toHaveLength(1);
  });

  it('does not count completions from the previous week', () => {
    const [entry] = call(3, ['2026-08-27', '2026-08-28'], MON);
    expect(entry.count).toBe(0);
  });
});

describe('habitsDueOn — monthly', () => {
  const call = (targetCount: number, doneDays: readonly string[], day: string) => {
    const clean = habit({ scheduleKind: 'monthly', targetCount, name: 'Deep clean' });
    return habitsDueOn([clean], indexCompletions(done(clean.id, doneDays)), day).monthly;
  };

  it('counts across the whole calendar month, not the week', () => {
    // Three weeks apart, so a week-scoped count would report 0 or 1 here.
    const [entry] = call(3, ['2026-09-01', '2026-09-20'], '2026-09-25');
    expect(entry.count).toBe(2);
    expect(entry.target).toBe(3);
  });

  it('steps aside once met', () => {
    expect(call(2, ['2026-09-01', '2026-09-20'], '2026-09-25')).toHaveLength(0);
  });

  it('resets at the start of the next month', () => {
    expect(call(2, ['2026-09-01', '2026-09-20'], '2026-10-01')).toHaveLength(1);
  });
});

describe('habitsDueOn — mixed', () => {
  it('sorts each habit into its own group', () => {
    const teeth = habit({ name: 'Teeth' });
    const gym = habit({ scheduleKind: 'weekly', targetCount: 3, name: 'Gym' });
    const clean = habit({ scheduleKind: 'monthly', targetCount: 1, name: 'Clean' });

    const due = habitsDueOn([teeth, gym, clean], indexCompletions([]), MON);
    expect(due.daily.map((entry) => entry.habit.name)).toEqual(['Teeth']);
    expect(due.weekly.map((entry) => entry.habit.name)).toEqual(['Gym']);
    expect(due.monthly.map((entry) => entry.habit.name)).toEqual(['Clean']);
    expect(isEmpty(due)).toBe(false);
  });

  it('is empty when nothing is scheduled', () => {
    const gym = habit({ weekdayMask: MON_TO_THU });
    expect(isEmpty(habitsDueOn([gym], indexCompletions([]), FRI))).toBe(true);
  });

  it('keeps each habit’s completions separate', () => {
    const a = habit();
    const b = habit();
    const index = indexCompletions([...done(a.id, [MON]), ...done(b.id, [TUE])]);
    const due = habitsDueOn([a, b], index, MON);
    expect(due.daily.find((entry) => entry.habit.id === a.id)?.done).toBe(true);
    expect(due.daily.find((entry) => entry.habit.id === b.id)?.done).toBe(false);
  });
});

describe('describeSchedule', () => {
  it('names a full week', () => {
    expect(describeSchedule(habit({ weekdayMask: EVERY_DAY }))).toBe('Every day');
  });

  it('lists chosen days Monday first', () => {
    expect(describeSchedule(habit({ weekdayMask: MON_TO_THU }))).toBe('Mon Tue Wed Thu');
  });

  it('puts Sunday last', () => {
    const weekend = (1 << 6) | (1 << 0);
    expect(describeSchedule(habit({ weekdayMask: weekend }))).toBe('Sat Sun');
  });

  it('says so when no day is selected', () => {
    expect(describeSchedule(habit({ weekdayMask: 0 }))).toBe('No days selected');
  });

  it('describes flexible targets by their period', () => {
    expect(describeSchedule(habit({ scheduleKind: 'weekly', targetCount: 3 }))).toBe(
      '3x per week'
    );
    expect(describeSchedule(habit({ scheduleKind: 'monthly', targetCount: 2 }))).toBe(
      '2x per month'
    );
  });
});
