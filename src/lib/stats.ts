import { addDays, maskIncludes, type DayKey } from './date';
import type { Habit } from './db/habits';
import {
  archivedOn,
  countInRange,
  monthRange,
  weekRange,
  type CompletionIndex,
  type DayRange,
} from './schedule';

// How well a habit is going. Pure, like the schedule engine it sits on.
//
// The number that matters is the completion rate, and the thing most habit
// trackers get wrong is its denominator: it is the days the habit was actually
// *scheduled*, not the days on the calendar. Gym on Mon–Thu across a 30-day
// month is roughly 17 opportunities, not 30.

export interface HabitStats {
  readonly habit: Habit;
  /** Completions inside the range that counted towards the target. */
  readonly done: number;
  /** Opportunities inside the range — scheduled days, or periods x target. */
  readonly scheduled: number;
  /** 0–100. A habit with no opportunities in the range scores 100, not 0. */
  readonly pct: number;
  readonly streak: number;
  readonly best: number;
  readonly belowTarget: boolean;
}

/** The last day worth counting: today, or the day the habit was archived. */
function lastCountedDay(habit: Habit, today: DayKey): DayKey {
  const archived = archivedOn(habit);
  if (archived === null) return today;
  const dayBefore = addDays(archived, -1);
  return dayBefore < today ? dayBefore : today;
}

/** The intersection of a range with the habit's own lifetime, or null if empty. */
function effectiveRange(habit: Habit, range: DayRange, today: DayKey): DayRange | null {
  const from = range.from > habit.startsOn ? range.from : habit.startsOn;
  const last = lastCountedDay(habit, today);
  const to = range.to < last ? range.to : last;
  return from > to ? null : { from, to };
}

/**
 * Opportunities and completions for a habit inside a range.
 *
 * Daily habits count scheduled days. Flexible ones count whole periods: each
 * week or month that overlaps the range contributes its full target, and the
 * completions inside it are capped at that target so an unusually good week
 * cannot pay for a bad one.
 *
 * A period still in progress contributes its full target, which reads as
 * pessimistic on a Monday. That is deliberate: the alternative is prorating by
 * elapsed days, which makes the same week score differently depending on when
 * you look at it.
 */
function tally(
  habit: Habit,
  days: ReadonlySet<DayKey> | undefined,
  range: DayRange,
  today: DayKey
): { done: number; scheduled: number } {
  const effective = effectiveRange(habit, range, today);
  if (effective === null) return { done: 0, scheduled: 0 };

  if (habit.scheduleKind === 'daily') {
    let done = 0;
    let scheduled = 0;
    for (let day = effective.from; day <= effective.to; day = addDays(day, 1)) {
      if (!maskIncludes(habit.weekdayMask, day)) continue;
      scheduled += 1;
      if (days?.has(day)) done += 1;
    }
    return { done, scheduled };
  }

  const rangeOf = habit.scheduleKind === 'weekly' ? weekRange : monthRange;
  let done = 0;
  let scheduled = 0;
  let cursor = effective.from;
  while (cursor <= effective.to) {
    const period = rangeOf(cursor);
    // Completions are counted across the whole period, not just the slice of it
    // inside the range — a target is met by the week, not by the query window.
    const count = countInRange(days, period);
    scheduled += habit.targetCount;
    done += Math.min(count, habit.targetCount);
    cursor = addDays(period.to, 1);
  }
  return { done, scheduled };
}

/**
 * Consecutive opportunities met, counting back from today.
 *
 * An opportunity still open — today, for a daily habit; this week, for a weekly
 * one — does not break the streak. Not having done it *yet* is not the same as
 * having missed it.
 */
export function currentStreak(
  habit: Habit,
  days: ReadonlySet<DayKey> | undefined,
  today: DayKey
): number {
  const end = lastCountedDay(habit, today);

  if (habit.scheduleKind === 'daily') {
    let streak = 0;
    let cursor = end;
    // Today is still open, so skip past it rather than counting it as a miss.
    if (maskIncludes(habit.weekdayMask, cursor) && !days?.has(cursor)) {
      cursor = addDays(cursor, -1);
    }
    while (cursor >= habit.startsOn) {
      if (maskIncludes(habit.weekdayMask, cursor)) {
        if (!days?.has(cursor)) break;
        streak += 1;
      }
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  const rangeOf = habit.scheduleKind === 'weekly' ? weekRange : monthRange;
  let streak = 0;
  let anchor = end;
  if (countInRange(days, rangeOf(anchor)) < habit.targetCount) {
    anchor = addDays(rangeOf(anchor).from, -1);
  }
  while (anchor >= habit.startsOn) {
    const period = rangeOf(anchor);
    if (countInRange(days, period) < habit.targetCount) break;
    streak += 1;
    anchor = addDays(period.from, -1);
  }
  return streak;
}

/** The longest run of met opportunities over the habit's whole life. */
export function longestStreak(
  habit: Habit,
  days: ReadonlySet<DayKey> | undefined,
  today: DayKey
): number {
  const end = lastCountedDay(habit, today);
  if (end < habit.startsOn) return 0;

  let best = 0;
  let run = 0;

  if (habit.scheduleKind === 'daily') {
    for (let day = habit.startsOn; day <= end; day = addDays(day, 1)) {
      if (!maskIncludes(habit.weekdayMask, day)) continue;
      run = days?.has(day) ? run + 1 : 0;
      if (run > best) best = run;
    }
    return best;
  }

  const rangeOf = habit.scheduleKind === 'weekly' ? weekRange : monthRange;
  let cursor = habit.startsOn;
  while (cursor <= end) {
    const period = rangeOf(cursor);
    run = countInRange(days, period) >= habit.targetCount ? run + 1 : 0;
    if (run > best) best = run;
    cursor = addDays(period.to, 1);
  }
  return best;
}

/** Everything the analytics screen shows for one habit. */
export function statsFor(
  habit: Habit,
  completions: CompletionIndex,
  range: DayRange,
  today: DayKey
): HabitStats {
  const days = completions.get(habit.id);
  const { done, scheduled } = tally(habit, days, range, today);
  // No opportunities is not a failure — a habit added yesterday has not missed
  // anything, and scoring it 0 would drag the whole grade down for no reason.
  const pct = scheduled === 0 ? 100 : Math.round((done / scheduled) * 100);

  return {
    habit,
    done,
    scheduled,
    pct,
    streak: currentStreak(habit, days, today),
    best: longestStreak(habit, days, today),
    belowTarget: scheduled > 0 && pct < habit.targetPct,
  };
}

/** Whether a habit is worth showing in the range at all. */
export function hadOpportunities(stats: HabitStats): boolean {
  return stats.scheduled > 0;
}

export interface Grade {
  readonly pct: number;
  readonly letter: string;
}

/**
 * The overall grade: the mean of the per-habit rates.
 *
 * A plain mean rather than one weighted by opportunities, so a habit scheduled
 * once a month counts as much as one scheduled daily. Weighting by opportunity
 * would let a single daily habit drown out everything else.
 */
export function overallGrade(all: readonly HabitStats[]): Grade {
  const counted = all.filter(hadOpportunities);
  if (counted.length === 0) return { pct: 100, letter: 'A' };

  const pct = Math.round(
    counted.reduce((total, stats) => total + stats.pct, 0) / counted.length
  );
  return { pct, letter: letterFor(pct) };
}

export function letterFor(pct: number): string {
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 60) return 'D';
  return 'F';
}

/** Habits below their own target, worst first — the "needs improvement" list. */
export function needsImprovement(all: readonly HabitStats[]): HabitStats[] {
  return all.filter((stats) => stats.belowTarget).sort((a, b) => a.pct - b.pct);
}
