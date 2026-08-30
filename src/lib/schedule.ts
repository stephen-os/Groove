import { fromDayKey, maskIncludes, toDayKey, WEEKDAYS, type DayKey } from './date';
import type { Completion } from './db/completions';
import type { Habit } from './db/habits';

// Which habits are due on a given day, and how far through their period the
// flexible ones are.
//
// This is the spine of the app: the Today screen, the history editor, the
// analytics denominators and the notification scheduler all ask this same
// question. Keeping it pure — no database, no clock it isn't handed — is what
// lets the awkward cases be tested in plain Node rather than found on a phone.

/** Completions arranged for lookup: habit id to the days it was done. */
export type CompletionIndex = ReadonlyMap<number, ReadonlySet<DayKey>>;

export function indexCompletions(completions: readonly Completion[]): CompletionIndex {
  const index = new Map<number, Set<DayKey>>();
  for (const completion of completions) {
    const days = index.get(completion.habitId) ?? new Set<DayKey>();
    days.add(completion.day);
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

/** How many days in `range` the habit was completed. */
export function countInRange(days: ReadonlySet<DayKey> | undefined, range: DayRange): number {
  if (!days) return 0;
  let count = 0;
  for (const day of days) {
    if (day >= range.from && day <= range.to) count += 1;
  }
  return count;
}

interface DailyEntry {
  readonly habit: Habit;
  readonly done: boolean;
}

interface PeriodEntry {
  readonly habit: Habit;
  readonly done: boolean;
  /** Completions so far inside the current week or month. */
  readonly count: number;
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
 * the period — except on a day they were actually ticked, where they stay
 * visible so the tick can be taken back.
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
    const done = days?.has(day) ?? false;

    if (habit.scheduleKind === 'daily') {
      if (maskIncludes(habit.weekdayMask, day)) daily.push({ habit, done });
      continue;
    }

    const range = habit.scheduleKind === 'weekly' ? weekRange(day) : monthRange(day);
    const count = countInRange(days, range);
    if (count >= habit.targetCount && !done) continue;

    const entry: PeriodEntry = { habit, done, count, target: habit.targetCount };
    if (habit.scheduleKind === 'weekly') weekly.push(entry);
    else monthly.push(entry);
  }

  return { daily, weekly, monthly };
}

/** Whether anything at all is due — cheaper than three length checks at the call site. */
export function isEmpty(due: DueToday): boolean {
  return due.daily.length === 0 && due.weekly.length === 0 && due.monthly.length === 0;
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
