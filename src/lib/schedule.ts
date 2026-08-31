import { addDays, fromDayKey, maskIncludes, toDayKey, WEEKDAYS, type DayKey } from './date';
import type { Completion, CompletionStatus } from './db/completions';
import type { Habit } from './db/habits';

// Which habits are due on a given day, and how far through their period the
// flexible ones are.
//
// This is the spine of the app: the Today screen, the history editor, the
// analytics denominators and the notification scheduler all ask this same
// question. Keeping it pure — no database, no clock it isn't handed — is what
// lets the awkward cases be tested in plain Node rather than found on a phone.

/** What happened to a habit on each day: done, skipped, or absent for neither. */
export type DayStatuses = ReadonlyMap<DayKey, CompletionStatus>;
export type CompletionIndex = ReadonlyMap<number, DayStatuses>;

export function indexCompletions(completions: readonly Completion[]): CompletionIndex {
  const index = new Map<number, Map<DayKey, CompletionStatus>>();
  for (const completion of completions) {
    const days = index.get(completion.habitId) ?? new Map<DayKey, CompletionStatus>();
    days.set(completion.day, completion.status);
    index.set(completion.habitId, days);
  }
  return index;
}

export interface DayRange {
  readonly from: DayKey;
  readonly to: DayKey;
}

/**
 * The Monday-first week containing `day`, inclusive at both ends.
 *
 * Monday-first because that is what the grading periods use. `Date.getDay()`
 * numbers Sunday as 0, so the offset back to Monday is `(weekday + 6) % 7` —
 * which maps Monday to 0 and Sunday to 6 rather than the other way round.
 */
export function weekRange(day: DayKey): DayRange {
  const date = fromDayKey(day);
  const start = fromDayKey(day);
  start.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { from: toDayKey(start), to: toDayKey(end) };
}

/** The calendar month containing `day`, inclusive at both ends. */
export function monthRange(day: DayKey): DayRange {
  const date = fromDayKey(day);
  // Day 0 of the next month is the last day of this one, which avoids having to
  // know which months have 31 days and which Februaries have 29.
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { from: toDayKey(start), to: toDayKey(end) };
}

/**
 * The completion window `habitsDueOn` needs to answer correctly for `range`.
 *
 * A flexible habit counts across its whole week or month, so asking about a day
 * requires every completion in the periods that day belongs to — not merely the
 * days on screen. Two callers guessed at this independently and one guessed
 * wrong: the history grid loaded only its calendar span, so a monthly habit on
 * a leading cell was measured against a July it had only seen the tail of, and
 * days that were in fact complete rendered as missed.
 *
 * Every caller asks here instead.
 */
export function windowFor(range: DayRange): DayRange {
  const starts = [weekRange(range.from).from, monthRange(range.from).from];
  const ends = [weekRange(range.to).to, monthRange(range.to).to];
  return {
    from: starts.reduce((a, b) => (a < b ? a : b)),
    to: ends.reduce((a, b) => (a > b ? a : b)),
  };
}

/** The period a flexible habit is measured over. */
export function periodOf(habit: Habit, day: DayKey): DayRange {
  return habit.scheduleKind === 'weekly' ? weekRange(day) : monthRange(day);
}

/** Days in a range, inclusive at both ends. */
function daysInRange(range: DayRange): number {
  let count = 0;
  for (let day = range.from; day <= range.to; day = addDays(day, 1)) count += 1;
  return count;
}

/** The day a habit was archived, or null while it is still active. */
export function archivedOn(habit: Habit): DayKey | null {
  return habit.archivedAt === null ? null : toDayKey(new Date(habit.archivedAt));
}

/**
 * Whether the habit existed on this day at all.
 *
 * Bounded by `startsOn` so a habit added today is not retroactively missing for
 * the rest of the month, and by the archive day so a retired habit stops
 * counting against you from the day you retired it.
 */
export function isActiveOn(habit: Habit, day: DayKey): boolean {
  if (day < habit.startsOn) return false;
  const archived = archivedOn(habit);
  return archived === null || day < archived;
}

/** How many days in `range` carry the given status. */
export function countStatus(
  days: DayStatuses | undefined,
  range: DayRange,
  status: CompletionStatus
): number {
  if (!days) return 0;
  let count = 0;
  for (const [day, value] of days) {
    if (value === status && day >= range.from && day <= range.to) count += 1;
  }
  return count;
}

/**
 * A flexible habit's target for one period, after skipped days are taken off.
 *
 * Skipping is opting out of one of the sessions: a 3x-per-week habit with one
 * day skipped needs two, not three. Floored at zero — skipping more days than
 * the target does not put you in credit.
 */
export function effectiveTarget(habit: Habit, days: DayStatuses | undefined, period: DayRange): number {
  return Math.max(0, habit.targetCount - countStatus(days, period, 'skipped'));
}

interface DailyEntry {
  readonly habit: Habit;
  readonly done: boolean;
  readonly skipped: boolean;
}

interface PeriodEntry {
  readonly habit: Habit;
  readonly done: boolean;
  readonly skipped: boolean;
  /** Completions so far inside the current week or month. */
  readonly count: number;
  /** The target after skipped days are deducted. */
  readonly target: number;
}

export interface DueToday {
  readonly daily: DailyEntry[];
  readonly weekly: PeriodEntry[];
  readonly monthly: PeriodEntry[];
}

/**
 * The habits to show for one day, split by how they are scheduled.
 *
 * Daily habits appear when the weekday bitmask includes the day. Flexible ones
 * appear every day until their target is met, then step aside for the rest of
 * the period — except on a day they were actually acted on, where they stay
 * visible so the tick or the skip can be taken back.
 */
export function habitsDueOn(
  habits: readonly Habit[],
  completions: CompletionIndex,
  day: DayKey
): DueToday {
  const daily: DailyEntry[] = [];
  const weekly: PeriodEntry[] = [];
  const monthly: PeriodEntry[] = [];

  for (const habit of habits) {
    if (!isActiveOn(habit, day)) continue;

    const days = completions.get(habit.id);
    const status = days?.get(day);
    const done = status === 'done';
    const skipped = status === 'skipped';

    if (habit.scheduleKind === 'daily') {
      if (maskIncludes(habit.weekdayMask, day)) daily.push({ habit, done, skipped });
      continue;
    }

    const period = periodOf(habit, day);
    const count = countStatus(days, period, 'done');
    const target = effectiveTarget(habit, days, period);
    if (count >= target && !done && !skipped) continue;

    const entry: PeriodEntry = { habit, done, skipped, count, target };
    if (habit.scheduleKind === 'weekly') weekly.push(entry);
    else monthly.push(entry);
  }

  return { daily, weekly, monthly };
}

/** Whether anything at all is due — cheaper than three length checks at the call site. */
export function isEmpty(due: DueToday): boolean {
  return due.daily.length === 0 && due.weekly.length === 0 && due.monthly.length === 0;
}

/**
 * How many completions a flexible habit ought to have by now in its period.
 *
 * Prorated by elapsed days and floored, so you are only behind once you have
 * demonstrably fallen behind: 3x a week means nothing is expected on Monday or
 * Tuesday, one by Wednesday, two by Friday. Rounding up instead would mark you
 * behind on the first morning of every week.
 */
export function expectedByNow(
  target: number,
  period: DayRange,
  today: DayKey,
  /** The first day the habit existed, if it began part-way through. */
  from: DayKey = period.from
): number {
  // A period the habit only partly lived through owes only the days it was
  // there for, at both ends: one it started inside, and one it was archived in.
  const start = from > period.from ? from : period.from;
  if (start > period.to) return 0;
  if (today < start) return 0;

  const end = today < period.to ? today : period.to;
  const elapsed = daysInRange({ from: start, to: end });
  const total = daysInRange(period);
  return Math.floor((target * elapsed) / total);
}

/** Anything carrying a habit — the shape `groupByDueTime` needs. */
export interface HasHabit {
  readonly habit: Habit;
}

export interface DueTimeGroup<T> {
  /** 'HH:MM', or null for the habits with no time attached. */
  readonly dueTime: string | null;
  readonly data: T[];
}

/**
 * Groups habits under the time they are due, earliest first.
 *
 * The time is the heading rather than something repeated on every row, so a
 * morning reads as one block: everything under 7:00 is what 7:00 asks of you.
 * Habits with no due time fall into a single trailing group — they are due
 * today, just not at any particular moment.
 *
 * Within a group the order is alphabetical. There is no manual ordering to
 * store: two habits at 7:00 sharp have no meaningful precedence, and a stable
 * rule beats an arbitrary one you have to maintain by hand.
 *
 * 'HH:MM' is zero-padded and 24-hour, so a plain string comparison is already
 * chronological — no parsing needed to sort.
 */
export function groupByDueTime<T extends HasHabit>(rows: readonly T[]): DueTimeGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    // '' stands in for "no due time" so the map has one key type; it sorts last
    // by the comparator below rather than by its value.
    const key = row.habit.dueTime ?? '';
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => {
      if (a === b) return 0;
      if (a === '') return 1;
      if (b === '') return -1;
      return a < b ? -1 : 1;
    })
    .map(([key, data]) => ({
      dueTime: key === '' ? null : key,
      data: [...data].sort((x, y) => x.habit.name.localeCompare(y.habit.name)),
    }));
}

/** A one-line description of when a habit happens, for the UI. */
export function describeSchedule(habit: Habit): string {
  if (habit.scheduleKind === 'weekly') return `${habit.targetCount}x per week`;
  if (habit.scheduleKind === 'monthly') return `${habit.targetCount}x per month`;

  // WEEKDAYS is already Monday-first and carries each day's bit, so the reading
  // order and the storage order stay separate without any arithmetic here.
  const chosen = WEEKDAYS.filter((weekday) => (habit.weekdayMask & (1 << weekday.bit)) !== 0);
  if (chosen.length === WEEKDAYS.length) return 'Every day';
  if (chosen.length === 0) return 'No days selected';
  return chosen.map((weekday) => weekday.label).join(' ');
}

/**
 * How a flexible habit's week or month is going, in words.
 *
 * Deliberately generous about the present and honest about the past: while the
 * period is still running it says what is left rather than what is missing, and
 * only calls you behind once the prorated pace says so.
 */
export function paceLabel(entry: PeriodEntry, today: DayKey): string {
  const remaining = Math.max(0, entry.target - entry.count);
  if (remaining === 0) return 'Done for the period';

  const period = periodOf(entry.habit, today);
  const expected = expectedByNow(entry.target, period, today);
  const behind = expected - entry.count;
  const left = `${remaining} to go`;

  if (behind > 0) return `${left} · ${behind} behind`;
  return `${left} · on track`;
}
