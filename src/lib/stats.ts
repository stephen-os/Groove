import { addDays, maskIncludes, type DayKey } from './date';
import type { Habit } from './db/habits';
import {
  archivedOn,
  countStatus,
  isActiveOn,
  effectiveTarget,
  expectedByNow,
  periodOf,
  type CompletionIndex,
  type DayRange,
  type DayStatuses,
} from './schedule';

// How well a habit is going. Pure, like the schedule engine it sits on.
//
// The number that matters is the completion rate, and the thing most habit
// trackers get wrong is its denominator. Two rules shape it here:
//
//  - It counts days the habit was actually *scheduled*, not days on the
//    calendar. Gym on Mon–Thu across September 2026 is 18 opportunities, not 30.
//  - It excludes days that were deliberately skipped, and prorates a period
//    that is still running. You cannot be marked down for days that have not
//    happened yet, or for ones you opted out of.

export interface HabitStats {
  readonly habit: Habit;
  /** Completions inside the range that counted towards the target. */
  readonly done: number;
  /** Opportunities inside the range, after skips and proration. */
  readonly scheduled: number;
  /** Days deliberately opted out of. Reported so the UI can say so. */
  readonly skipped: number;
  /** 0–100. A habit with no opportunities yet scores 100, not 0. */
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
 * Daily habits count scheduled days, minus the ones skipped. Flexible ones count
 * whole periods: each contributes its target after skips, and a period still in
 * progress contributes only what is expected *by now* — so looking at your week
 * on Tuesday does not judge you on Thursday's session.
 */
function tally(
  habit: Habit,
  days: DayStatuses | undefined,
  range: DayRange,
  today: DayKey
): { done: number; scheduled: number; skipped: number } {
  const effective = effectiveRange(habit, range, today);
  if (effective === null) return { done: 0, scheduled: 0, skipped: 0 };

  if (habit.scheduleKind === 'daily') {
    let done = 0;
    let scheduled = 0;
    let skipped = 0;
    for (let day = effective.from; day <= effective.to; day = addDays(day, 1)) {
      if (!maskIncludes(habit.weekdayMask, day)) continue;
      const status = days?.get(day);
      if (status === 'skipped') {
        skipped += 1;
        continue;
      }
      scheduled += 1;
      if (status === 'done') done += 1;
    }
    return { done, scheduled, skipped };
  }

  let done = 0;
  let scheduled = 0;
  let skipped = 0;
  let cursor = effective.from;
  while (cursor <= effective.to) {
    const period = periodOf(habit, cursor);
    // Completions are counted across the whole period, not just the slice of it
    // inside the range — a target is met by the week, not by the query window.
    const count = countStatus(days, period, 'done');
    const target = expectedByNow(effectiveTarget(habit, days, period), period, today);
    scheduled += target;
    // Capped at the target so an unusually good week cannot pay for a bad one.
    done += Math.min(count, target);
    skipped += countStatus(days, period, 'skipped');
    cursor = addDays(period.to, 1);
  }
  return { done, scheduled, skipped };
}

/**
 * Consecutive opportunities met, counting back from today.
 *
 * An opportunity still open — today, for a daily habit; this week, for a weekly
 * one — does not break the streak. Not having done it *yet* is not the same as
 * having missed it. A skipped day breaks nothing either: opting out is not
 * failing, so the streak steps over it exactly as it steps over a rest day.
 */
export function currentStreak(
  habit: Habit,
  days: DayStatuses | undefined,
  today: DayKey
): number {
  const end = lastCountedDay(habit, today);

  // A daily habit scheduled on no days has no opportunities to count, and the
  // walk below would never reach its `break` — it would step back past year
  // zero forever. The form forbids an empty mask; a restored backup need not.
  if (habit.scheduleKind === 'daily' && habit.weekdayMask === 0) return 0;

  if (habit.scheduleKind === 'daily') {
    let streak = 0;
    let cursor = end;
    // Today is still open, so skip past it rather than counting it as a miss.
    if (maskIncludes(habit.weekdayMask, cursor) && days?.get(cursor) !== 'done') {
      cursor = addDays(cursor, -1);
    }
    while (cursor >= habit.startsOn) {
      if (maskIncludes(habit.weekdayMask, cursor)) {
        const status = days?.get(cursor);
        if (status === 'done') streak += 1;
        else if (status !== 'skipped') break;
      }
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  const met = (day: DayKey): boolean => {
    const period = periodOf(habit, day);
    return countStatus(days, period, 'done') >= effectiveTarget(habit, days, period);
  };

  let streak = 0;
  let anchor = end;
  if (!met(anchor)) anchor = addDays(periodOf(habit, anchor).from, -1);
  while (anchor >= habit.startsOn) {
    if (!met(anchor)) break;
    streak += 1;
    anchor = addDays(periodOf(habit, anchor).from, -1);
  }
  return streak;
}

/** The longest run of met opportunities over the habit's whole life. */
export function longestStreak(
  habit: Habit,
  days: DayStatuses | undefined,
  today: DayKey
): number {
  const end = lastCountedDay(habit, today);
  if (end < habit.startsOn) return 0;
  if (habit.scheduleKind === 'daily' && habit.weekdayMask === 0) return 0;

  let best = 0;
  let run = 0;

  if (habit.scheduleKind === 'daily') {
    for (let day = habit.startsOn; day <= end; day = addDays(day, 1)) {
      if (!maskIncludes(habit.weekdayMask, day)) continue;
      const status = days?.get(day);
      if (status === 'skipped') continue;
      run = status === 'done' ? run + 1 : 0;
      if (run > best) best = run;
    }
    return best;
  }

  let cursor = habit.startsOn;
  while (cursor <= end) {
    const period = periodOf(habit, cursor);
    const met =
      countStatus(days, period, 'done') >= effectiveTarget(habit, days, period);
    run = met ? run + 1 : 0;
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
  const { done, scheduled, skipped } = tally(habit, days, range, today);
  // No opportunities is not a failure — a habit added yesterday has not missed
  // anything, and scoring it 0 would drag the whole grade down for no reason.
  const pct = scheduled === 0 ? 100 : Math.round((done / scheduled) * 100);

  return {
    habit,
    done,
    scheduled,
    skipped,
    pct,
    streak: currentStreak(habit, days, today),
    best: longestStreak(habit, days, today),
    belowTarget: scheduled > 0 && pct < habit.targetPct,
  };
}

/** Whether a habit is worth showing in the range at all. */
export function hadOpportunities(stats: HabitStats): boolean {
  return stats.scheduled > 0 || stats.skipped > 0;
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
  const counted = all.filter((stats) => stats.scheduled > 0);
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

export interface DayRate {
  readonly day: DayKey;
  /** 0–100, or null on a day nothing was scheduled. */
  readonly pct: number | null;
}

/**
 * The share of each day that was completed, across every habit.
 *
 * A day with nothing scheduled is null rather than zero — a rest day is not a
 * failure, and plotting it as one would drag every weekend to the floor.
 * Skipped habits leave the denominator, exactly as they do everywhere else.
 */
export function dailyRates(
  habits: readonly Habit[],
  completions: CompletionIndex,
  range: DayRange,
  today: DayKey
): DayRate[] {
  const rates: DayRate[] = [];

  for (let day = range.from; day <= range.to && day <= today; day = addDays(day, 1)) {
    let done = 0;
    let scheduled = 0;

    for (const habit of habits) {
      if (!isActiveOn(habit, day)) continue;
      const days = completions.get(habit.id);
      const status = days?.get(day);
      if (status === 'skipped') continue;

      if (habit.scheduleKind === 'daily') {
        if (!maskIncludes(habit.weekdayMask, day)) continue;
        scheduled += 1;
        if (status === 'done') done += 1;
      } else if (status === 'done') {
        // A flexible habit has no particular day it is owed on, so it only
        // counts on the days it was actually done. Counting it as outstanding
        // every day would punish a 3x-a-week habit on the four days off.
        scheduled += 1;
        done += 1;
      }
    }

    rates.push({ day, pct: scheduled === 0 ? null : Math.round((done / scheduled) * 100) });
  }

  return rates;
}

/**
 * A trailing average over `window` days, which is what turns a spiky daily
 * series into a trend you can read.
 *
 * Days with nothing scheduled are skipped rather than counted as zero, so a
 * quiet weekend does not pull the line down. A window containing no scheduled
 * days at all carries the previous value forward — the line goes flat instead
 * of breaking, which is the honest shape for "nothing happened here".
 */
export function rollingAverage(rates: readonly DayRate[], window: number): number[] {
  const out: number[] = [];
  let last = 0;

  rates.forEach((_rate, index) => {
    const from = Math.max(0, index - window + 1);
    const slice = rates.slice(from, index + 1).filter((entry) => entry.pct !== null);

    if (slice.length === 0) {
      out.push(last);
      return;
    }
    const mean = slice.reduce((total, entry) => total + (entry.pct ?? 0), 0) / slice.length;
    last = Math.round(mean);
    out.push(last);
  });

  return out;
}

/** Habits below their own target, worst first — the "needs improvement" list. */
export function needsImprovement(all: readonly HabitStats[]): HabitStats[] {
  return all.filter((stats) => stats.belowTarget).sort((a, b) => a.pct - b.pct);
}
