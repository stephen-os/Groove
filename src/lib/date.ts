// Local calendar days, as 'YYYY-MM-DD' strings.
//
// A habit day is a day on a wall calendar, not an instant. Everything here works
// in the device's own timezone on purpose: `toISOString()` would be the plausible
// one-liner and would silently record the wrong day for anyone west of UTC after
// mid-afternoon — the kind of bug that surfaces weeks later as "yesterday's tick
// is on the wrong row".
//
// Pure, so the awkward cases — month ends, leap days, the day the clocks change —
// are tested in plain Node rather than discovered on a phone.

/** A local calendar day, e.g. '2026-08-30'. */
export type DayKey = string;

/** The local calendar day a given instant falls on. */
export function toDayKey(date: Date): DayKey {
  // Padded to four digits. Day keys are compared as strings throughout, and an
  // unpadded '999-12-31' sorts *above* '1000-01-01' — which turns every loop
  // that walks backwards to a start bound into an infinite one.
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Today, in the device's timezone. */
export function todayKey(now: Date = new Date()): DayKey {
  return toDayKey(now);
}

/**
 * The three numbers in a day key.
 *
 * Defaulted to NaN rather than asserted. A malformed key produced an Invalid
 * Date before and still does — the alternative is throwing from a parser that
 * several screens call on every render.
 */
function parts(key: DayKey): [number, number, number] {
  const [year = NaN, month = NaN, day = NaN] = key.split('-').map(Number);
  return [year, month, day];
}

/**
 * A day key parsed back into a local `Date` at midnight.
 *
 * Built from components rather than `new Date(key)`, which the language spec
 * requires to be parsed as *UTC* midnight — an instant that belongs to the
 * previous day in every timezone behind UTC.
 */
export function fromDayKey(key: DayKey): Date {
  const [year, month, day] = parts(key);
  return new Date(year, month - 1, day);
}

/** The day `count` days after `key` (negative counts go backwards). */
export function addDays(key: DayKey, count: number): DayKey {
  const date = fromDayKey(key);
  // setDate rolls over month and year ends by itself, including leap days.
  date.setDate(date.getDate() + count);
  return toDayKey(date);
}

/**
 * A local `Date` for a wall-clock time on a given day.
 *
 * Built from components for the same reason as `fromDayKey`: 7am means 7am
 * where the phone is, not 7am UTC.
 */
export function atTimeOn(key: DayKey, time: string): Date {
  const [year, month, day] = parts(key);
  const [hours = NaN, minutes = NaN] = time.split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes, 0, 0);
}

/**
 * An 'HH:MM' wall clock rendered the way the device writes times.
 *
 * The date is arbitrary — only the time is read — but it has to be a real one,
 * because `toLocaleTimeString` has nothing else to format.
 */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Day of the week for a day key, numbered as `Date.getDay()`: 0 is Sunday. */
export function weekdayOf(key: DayKey): number {
  return fromDayKey(key).getDay();
}

/** Whether a habit's weekday bitmask includes this day. */
export function maskIncludes(mask: number, key: DayKey): boolean {
  return (mask & (1 << weekdayOf(key))) !== 0;
}

/**
 * Weekday chips in display order, Monday first, each carrying the bit it sets.
 *
 * The display order and the storage order are deliberately different: storage
 * follows `Date.getDay()` so no conversion is ever needed, while a week that
 * reads Mon–Sun is what the user expects to see.
 */
export const WEEKDAYS: readonly { readonly label: string; readonly bit: number }[] = [
  { label: 'Mon', bit: 1 },
  { label: 'Tue', bit: 2 },
  { label: 'Wed', bit: 3 },
  { label: 'Thu', bit: 4 },
  { label: 'Fri', bit: 5 },
  { label: 'Sat', bit: 6 },
  { label: 'Sun', bit: 0 },
];

/** Every day of the week — the default for a new daily habit. */
export const EVERY_DAY = 0b1111111;
