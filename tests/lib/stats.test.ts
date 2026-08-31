import { describe, expect, it } from 'vitest';
import { EVERY_DAY } from '@/lib/date';
import type { Completion } from '@/lib/db/completions';
import type { Habit } from '@/lib/db/habits';
import { indexCompletions } from '@/lib/schedule';
import {
  currentStreak,
  hadOpportunities,
  letterFor,
  longestStreak,
  needsImprovement,
  overallGrade,
  statsFor,
} from '@/lib/stats';

// September 2026 runs Tue 1 to Wed 30 and contains exactly 4 Mondays.
const SEPTEMBER = { from: '2026-09-01', to: '2026-09-30' };
const MON_TO_THU = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4);

let nextId = 1;
const habit = (overrides: Partial<Habit> = {}): Habit => ({
  id: nextId++,
  profileId: 1,
  name: 'Habit',
  icon: '',
  color: '',
  scheduleKind: 'daily',
  weekdayMask: EVERY_DAY,
  targetCount: 1,
  dueTime: null,
  remindEnabled: false,
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

const daysOfSeptember = (count: number): string[] =>
  Array.from({ length: count }, (_, index) => `2026-09-${String(index + 1).padStart(2, '0')}`);

// The day after the range, so every day in it is closed. Anchoring `today` on
// the last day of the range instead made every test below quietly assert that
// today counts toward the denominator too — which is a separate rule, is tested
// on its own further down, and is not what any of these are about.
const stats = (h: Habit, completions: readonly Completion[], today = '2026-10-01') =>
  statsFor(h, indexCompletions(completions), SEPTEMBER, today);

describe('statsFor — denominator', () => {
  it('counts calendar days for an every-day habit', () => {
    const teeth = habit();
    expect(stats(teeth, done(teeth.id, daysOfSeptember(30))).scheduled).toBe(30);
  });

  it('counts only scheduled days for a masked habit', () => {
    const gym = habit({ weekdayMask: MON_TO_THU });
    // September 2026: Mondays 7, 14, 21, 28 — 4 of each of Mon–Thu except
    // Tue/Wed which also fall on the 1st and 2nd, giving 18 in total.
    const result = stats(gym, []);
    expect(result.scheduled).toBe(18);
    expect(result.scheduled).toBeLessThan(30);
  });

  it('does not count days before the habit started', () => {
    const late = habit({ startsOn: '2026-09-21' });
    expect(stats(late, []).scheduled).toBe(10);
  });

  it('does not count days from the archive day onwards', () => {
    const retired = habit({ archivedAt: new Date(2026, 8, 11).getTime() });
    // Active 1–10 September; the 11th is the archive day and is excluded.
    expect(stats(retired, []).scheduled).toBe(10);
  });

  it('does not count days that have not happened yet', () => {
    const teeth = habit();
    // Nine, not ten: the 1st to the 9th are closed and missed, and the 10th is
    // today — still open, and not yet anything.
    expect(stats(teeth, [], '2026-09-10').scheduled).toBe(9);
  });

  // Today is the day the app is actually looked at, so what it does with it is
  // the number a person sees most often.
  it('leaves today out until something is done about it', () => {
    const teeth = habit();
    // Counting today from midnight opened Analytics on 0% and grade F for a
    // habit with a months-long streak, recovering only as the day was ticked.
    expect(stats(teeth, [], '2026-09-10')).toMatchObject({ done: 0, scheduled: 9 });
  });

  it('counts today the moment it is ticked', () => {
    const teeth = habit();
    const result = stats(teeth, done(teeth.id, ['2026-09-10']), '2026-09-10');
    expect(result).toMatchObject({ done: 1, scheduled: 10 });
    expect(result.pct).toBe(10);
  });

  it('leaves today out of the denominator when it is skipped', () => {
    const teeth = habit();
    expect(stats(teeth, skip(teeth.id, ['2026-09-10']), '2026-09-10')).toMatchObject({
      scheduled: 9,
      skipped: 1,
    });
  });

  it('treats a fresh day the same whatever the schedule kind', () => {
    // The bug this replaces: the same "nothing done yet" state scored 0% for a
    // daily habit and 100% for a flexible one, so the grade card depended on
    // which kind happened to be in the list rather than on how anyone had done.
    const week = { from: '2026-08-31', to: '2026-09-06' };
    const monday = '2026-08-31';
    const daily = habit({ startsOn: '2026-08-01' });
    const flexible = habit({ scheduleKind: 'weekly', targetCount: 3, startsOn: '2026-08-01' });

    const one = statsFor(daily, indexCompletions([]), week, monday);
    const other = statsFor(flexible, indexCompletions([]), week, monday);
    expect(one.pct).toBe(other.pct);
    expect(one.belowTarget).toBe(false);
    expect(overallGrade([one, other])).toEqual({ pct: 100, letter: 'A' });
  });

  it('is not counted as a perfect week when every day was skipped', () => {
    // `scheduled` falls to zero because skipping opts the day out, and the
    // "nothing to measure" fallback then reported 100% behind a full green bar
    // over the caption "0 of 0" — a week the habit was never once done, shown
    // as flawless. Something opted out of has no rate to report at all.
    const teeth = habit();
    const result = stats(teeth, skip(teeth.id, daysOfSeptember(30)));
    expect(result).toMatchObject({ done: 0, scheduled: 0, skipped: 30 });
    expect(hadOpportunities(result)).toBe(false);
  });

  it('scores a habit with no opportunities as 100, not 0', () => {
    const future = habit({ startsOn: '2027-01-01' });
    const result = stats(future, []);
    expect(result.scheduled).toBe(0);
    expect(result.pct).toBe(100);
    expect(result.belowTarget).toBe(false);
  });
});

describe('statsFor — rate', () => {
  it('is the share of scheduled days completed', () => {
    const teeth = habit();
    expect(stats(teeth, done(teeth.id, daysOfSeptember(15))).pct).toBe(50);
  });

  it('ignores completions on days the habit was not scheduled', () => {
    const gym = habit({ weekdayMask: 1 << 1 }); // Mondays only
    // Four Mondays in September 2026; ticking a Sunday should not help.
    const result = stats(gym, done(gym.id, ['2026-09-07', '2026-09-06']));
    expect(result.scheduled).toBe(4);
    expect(result.done).toBe(1);
  });

  it('flags a habit below its own target', () => {
    const teeth = habit({ targetPct: 90 });
    const result = stats(teeth, done(teeth.id, daysOfSeptember(24))); // 80%
    expect(result.pct).toBe(80);
    expect(result.belowTarget).toBe(true);
  });

  it('does not flag a habit that meets its target exactly', () => {
    const teeth = habit({ targetPct: 80 });
    expect(stats(teeth, done(teeth.id, daysOfSeptember(24))).belowTarget).toBe(false);
  });
});

describe('statsFor — flexible habits', () => {
  it('counts each finished period as its full target, and prorates the open one', () => {
    const gym = habit({ scheduleKind: 'weekly', targetCount: 3 });
    // September 2026 overlaps five Monday-first weeks. Four have ended and
    // contribute 3 each; the fifth (28 Sep – 4 Oct) is three days in on the
    // 30th, so it asks for floor(3 x 3/7) = 1.
    expect(stats(gym, []).scheduled).toBe(13);
  });

  it('caps a good week so it cannot pay for a bad one', () => {
    const gym = habit({ scheduleKind: 'weekly', targetCount: 2 });
    // Five sessions in the week of 7 Sep; the target is 2, so only 2 count.
    const result = stats(
      gym,
      done(gym.id, ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11'])
    );
    expect(result.done).toBe(2);
  });

  it('counts monthly targets by the month', () => {
    const clean = habit({ scheduleKind: 'monthly', targetCount: 2 });
    const result = stats(clean, done(clean.id, ['2026-09-03', '2026-09-25']));
    expect(result.scheduled).toBe(2);
    expect(result.done).toBe(2);
    expect(result.pct).toBe(100);
  });
});

describe('statsFor — skipping', () => {
  it('takes a skipped day out of the denominator', () => {
    const teeth = habit();
    const result = statsFor(
      teeth,
      indexCompletions([...done(teeth.id, daysOfSeptember(29)), ...skip(teeth.id, ['2026-09-30'])]),
      SEPTEMBER,
      '2026-09-30'
    );
    // 29 done, one opted out of, so 29 of 29 rather than 29 of 30.
    expect(result.scheduled).toBe(29);
    expect(result.done).toBe(29);
    expect(result.skipped).toBe(1);
    expect(result.pct).toBe(100);
  });

  it('does not let a skip count as a completion', () => {
    const teeth = habit();
    const result = statsFor(
      teeth,
      indexCompletions(skip(teeth.id, daysOfSeptember(30))),
      SEPTEMBER,
      '2026-09-30'
    );
    expect(result.done).toBe(0);
    expect(result.scheduled).toBe(0);
    expect(result.skipped).toBe(30);
  });

  it('reduces a flexible target rather than the day count', () => {
    const gym = habit({ scheduleKind: 'weekly', targetCount: 3 });
    const result = statsFor(
      gym,
      indexCompletions([
        ...done(gym.id, ['2026-09-07', '2026-09-08']),
        ...skip(gym.id, ['2026-09-09']),
      ]),
      { from: '2026-09-07', to: '2026-09-13' },
      '2026-09-13'
    );
    // Three a week with one opted out of is two, and two were done.
    expect(result.scheduled).toBe(2);
    expect(result.done).toBe(2);
    expect(result.pct).toBe(100);
  });
});

describe('statsFor — proration', () => {
  const week = { from: '2026-09-07', to: '2026-09-13' };

  it('does not judge a week on days that have not happened', () => {
    const gym = habit({ scheduleKind: 'weekly', targetCount: 3 });
    // Monday morning, nothing done. Nothing is expected yet either.
    const monday = statsFor(gym, indexCompletions([]), week, '2026-09-07');
    expect(monday.scheduled).toBe(0);
    expect(monday.pct).toBe(100);
  });

  it('starts expecting sessions as the week runs on', () => {
    const gym = habit({ scheduleKind: 'weekly', targetCount: 3 });
    const wednesday = statsFor(gym, indexCompletions([]), week, '2026-09-09');
    expect(wednesday.scheduled).toBe(1);
    expect(wednesday.pct).toBe(0);
  });

  it('reads 100% when you are keeping pace mid-week', () => {
    const gym = habit({ scheduleKind: 'weekly', targetCount: 3 });
    const result = statsFor(
      gym,
      indexCompletions(done(gym.id, ['2026-09-07'])),
      week,
      '2026-09-09'
    );
    expect(result.pct).toBe(100);
  });

  it('judges the whole target once the week is over', () => {
    const gym = habit({ scheduleKind: 'weekly', targetCount: 3 });
    const result = statsFor(
      gym,
      indexCompletions(done(gym.id, ['2026-09-07'])),
      week,
      '2026-09-13'
    );
    expect(result.scheduled).toBe(3);
    expect(result.done).toBe(1);
    expect(result.pct).toBe(33);
  });
});

describe('currentStreak', () => {
  const index = (h: Habit, days: readonly string[]) =>
    indexCompletions(done(h.id, days)).get(h.id);

  it('counts consecutive completed days', () => {
    const teeth = habit({ startsOn: '2026-09-01' });
    const days = ['2026-09-08', '2026-09-09', '2026-09-10'];
    expect(currentStreak(teeth, index(teeth, days), '2026-09-10')).toBe(3);
  });

  it('is not broken by today being still undone', () => {
    const teeth = habit({ startsOn: '2026-09-01' });
    const days = ['2026-09-08', '2026-09-09'];
    // The 10th is today and not yet ticked — the streak is still 2, not 0.
    expect(currentStreak(teeth, index(teeth, days), '2026-09-10')).toBe(2);
  });

  it('is broken by a missed day that is in the past', () => {
    const teeth = habit({ startsOn: '2026-09-01' });
    const days = ['2026-09-08', '2026-09-10'];
    // The 9th was missed, so only the 10th counts.
    expect(currentStreak(teeth, index(teeth, days), '2026-09-10')).toBe(1);
  });

  it('steps over days the habit was never scheduled', () => {
    const gym = habit({ weekdayMask: MON_TO_THU, startsOn: '2026-09-01' });
    // Thu 10, Mon 14, Tue 15 — Friday to Sunday between them are not gym days.
    const days = ['2026-09-10', '2026-09-14', '2026-09-15'];
    expect(currentStreak(gym, index(gym, days), '2026-09-15')).toBe(3);
  });

  it('is zero when nothing has been done', () => {
    const teeth = habit({ startsOn: '2026-09-01' });
    expect(currentStreak(teeth, undefined, '2026-09-10')).toBe(0);
  });

  it('steps over a skipped day rather than breaking on it', () => {
    const teeth = habit({ startsOn: '2026-09-01' });
    const days = indexCompletions([
      ...done(teeth.id, ['2026-09-08', '2026-09-10']),
      ...skip(teeth.id, ['2026-09-09']),
    ]).get(teeth.id);
    // Opting out of the 9th is not failing it, so the run holds at two.
    expect(currentStreak(teeth, days, '2026-09-10')).toBe(2);
  });

  it('counts met weeks for a flexible habit', () => {
    const gym = habit({ scheduleKind: 'weekly', targetCount: 2, startsOn: '2026-08-31' });
    const days = ['2026-08-31', '2026-09-01', '2026-09-07', '2026-09-08'];
    // Two full weeks met; the week of 14 Sep is still open.
    expect(currentStreak(gym, index(gym, days), '2026-09-14')).toBe(2);
  });
});

describe('longestStreak', () => {
  it('finds the best run, not the current one', () => {
    const teeth = habit({ startsOn: '2026-09-01' });
    const days = [
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
      // gap
      '2026-09-10',
    ];
    const set = indexCompletions(done(teeth.id, days)).get(teeth.id);
    expect(longestStreak(teeth, set, '2026-09-10')).toBe(4);
    expect(currentStreak(teeth, set, '2026-09-10')).toBe(1);
  });

  it('is zero for a habit never completed', () => {
    const teeth = habit({ startsOn: '2026-09-01' });
    expect(longestStreak(teeth, undefined, '2026-09-10')).toBe(0);
  });
});

describe('currentStreak — a habit that has been archived', () => {
  // Archived habits are loaded onto Analytics by `listHabitsWithArchived`, so
  // these numbers are rendered rather than merely computed.
  const RETIRED = new Date(2026, 8, 11).getTime(); // archived on 11 September

  it('ends the streak on a missed final day', () => {
    // Done the 7th, 8th and 9th, missed the 10th, archived on the 11th. The
    // 10th was its last opportunity and it was missed, so there is no current
    // streak. The "today is still open" step-back used to apply to the 10th as
    // well, stepping over a real miss and reporting three.
    const retired = habit({ startsOn: '2026-09-01', archivedAt: RETIRED });
    const worked = done(retired.id, ['2026-09-07', '2026-09-08', '2026-09-09']);
    expect(currentStreak(retired, indexCompletions(worked).get(retired.id), '2026-09-30')).toBe(0);
  });

  it('still counts a streak that ran to its last day', () => {
    const retired = habit({ startsOn: '2026-09-01', archivedAt: RETIRED });
    const worked = done(retired.id, ['2026-09-08', '2026-09-09', '2026-09-10']);
    expect(currentStreak(retired, indexCompletions(worked).get(retired.id), '2026-09-30')).toBe(3);
  });

  it('still steps over today for a habit that is not archived', () => {
    // The step-back is right for today, which has not finished. Narrowing it to
    // archived habits must not take that with it.
    const live = habit({ startsOn: '2026-09-01' });
    const worked = done(live.id, ['2026-09-08', '2026-09-09']);
    expect(currentStreak(live, indexCompletions(worked).get(live.id), '2026-09-10')).toBe(2);
  });
});

describe('overallGrade', () => {
  const withPct = (pct: number, targetPct = 80): ReturnType<typeof statsFor> => {
    const h = habit({ targetPct });
    return statsFor(
      h,
      indexCompletions(done(h.id, daysOfSeptember(Math.round((pct / 100) * 30)))),
      SEPTEMBER,
      '2026-10-01'
    );
  };

  it('averages the per-habit rates', () => {
    const grade = overallGrade([withPct(100), withPct(50)]);
    expect(grade.pct).toBe(75);
    expect(grade.letter).toBe('C');
  });

  it('ignores habits with no opportunities in the range', () => {
    const future = statsFor(
      habit({ startsOn: '2027-01-01' }),
      indexCompletions([]),
      SEPTEMBER,
      '2026-09-30'
    );
    expect(overallGrade([withPct(50), future]).pct).toBe(50);
  });

  it('is an A when there is nothing to grade', () => {
    expect(overallGrade([])).toEqual({ pct: 100, letter: 'A' });
  });
});

describe('letterFor', () => {
  it('maps each band', () => {
    expect(letterFor(100)).toBe('A');
    expect(letterFor(90)).toBe('A');
    expect(letterFor(89)).toBe('B');
    expect(letterFor(80)).toBe('B');
    expect(letterFor(70)).toBe('C');
    expect(letterFor(60)).toBe('D');
    expect(letterFor(59)).toBe('F');
    expect(letterFor(0)).toBe('F');
  });
});

describe('needsImprovement', () => {
  it('lists only habits below their own target, worst first', () => {
    const good = habit({ name: 'Good', targetPct: 50 });
    const bad = habit({ name: 'Bad', targetPct: 90 });
    const worst = habit({ name: 'Worst', targetPct: 90 });

    const all = [
      statsFor(good, indexCompletions(done(good.id, daysOfSeptember(30))), SEPTEMBER, '2026-09-30'),
      statsFor(bad, indexCompletions(done(bad.id, daysOfSeptember(24))), SEPTEMBER, '2026-09-30'),
      statsFor(worst, indexCompletions(done(worst.id, daysOfSeptember(9))), SEPTEMBER, '2026-09-30'),
    ];

    expect(needsImprovement(all).map((entry) => entry.habit.name)).toEqual(['Worst', 'Bad']);
  });
});
