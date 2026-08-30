import { describe, expect, it } from 'vitest';
import {
  EVERY_DAY,
  fromDayKey,
  maskIncludes,
  toDayKey,
  todayKey,
  WEEKDAYS,
  weekdayOf,
} from '@/lib/date';

// Every date here is built from local components (`new Date(y, m, d)`) and read
// back with local getters, so these assertions hold in any timezone the test
// runner happens to be in. A literal like `new Date('2026-08-30')` would parse
// as UTC midnight and make the suite pass in London and fail in New York.

describe('toDayKey', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(toDayKey(new Date(2026, 7, 30))).toBe('2026-08-30');
  });

  it('zero-pads single-digit months and days', () => {
    expect(toDayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('uses the local day, not the UTC one', () => {
    // 23:30 local. In any timezone ahead of UTC this instant is already the
    // next day in UTC, and toISOString() would report tomorrow.
    expect(toDayKey(new Date(2026, 7, 30, 23, 30))).toBe('2026-08-30');
  });

  it('uses the local day for early-morning instants too', () => {
    // 00:30 local — the mirror case, which UTC would report as yesterday for
    // any timezone behind UTC.
    expect(toDayKey(new Date(2026, 7, 30, 0, 30))).toBe('2026-08-30');
  });

  it('handles a leap day', () => {
    expect(toDayKey(new Date(2028, 1, 29))).toBe('2028-02-29');
  });
});

describe('todayKey', () => {
  it('formats the instant it is given', () => {
    expect(todayKey(new Date(2026, 11, 31, 12))).toBe('2026-12-31');
  });
});

describe('fromDayKey', () => {
  it('round-trips through toDayKey', () => {
    for (const key of ['2026-01-01', '2026-08-30', '2028-02-29', '2026-12-31']) {
      expect(toDayKey(fromDayKey(key))).toBe(key);
    }
  });

  it('returns local midnight, not UTC midnight', () => {
    const date = fromDayKey('2026-08-30');
    expect(date.getHours()).toBe(0);
    expect(date.getDate()).toBe(30);
    expect(date.getMonth()).toBe(7);
  });
});

describe('weekdayOf', () => {
  it('numbers days the way Date.getDay() does', () => {
    // 2026-08-30 is a Sunday.
    expect(weekdayOf('2026-08-30')).toBe(0);
    expect(weekdayOf('2026-08-31')).toBe(1);
    expect(weekdayOf('2026-09-05')).toBe(6);
  });
});

describe('maskIncludes', () => {
  it('accepts every day when the mask is EVERY_DAY', () => {
    for (let offset = 0; offset < 7; offset += 1) {
      expect(maskIncludes(EVERY_DAY, toDayKey(new Date(2026, 7, 24 + offset)))).toBe(true);
    }
  });

  it('rejects everything when the mask is empty', () => {
    expect(maskIncludes(0, '2026-08-30')).toBe(false);
  });

  it('matches a Monday-to-Thursday gym schedule', () => {
    const monToThu = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4);
    // 2026-08-31 is a Monday, so this week runs Mon 31 Aug to Sun 6 Sep.
    expect(maskIncludes(monToThu, '2026-08-31')).toBe(true); // Mon
    expect(maskIncludes(monToThu, '2026-09-03')).toBe(true); // Thu
    expect(maskIncludes(monToThu, '2026-09-04')).toBe(false); // Fri
    expect(maskIncludes(monToThu, '2026-09-06')).toBe(false); // Sun
  });

  it('matches a single-day weekly habit', () => {
    const sundaysOnly = 1 << 0;
    expect(maskIncludes(sundaysOnly, '2026-08-30')).toBe(true);
    expect(maskIncludes(sundaysOnly, '2026-08-31')).toBe(false);
  });
});

describe('WEEKDAYS', () => {
  it('lists a full week Monday first', () => {
    expect(WEEKDAYS.map((weekday) => weekday.label)).toEqual([
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
      'Sun',
    ]);
  });

  it('covers exactly the bits EVERY_DAY sets', () => {
    const combined = WEEKDAYS.reduce((mask, weekday) => mask | (1 << weekday.bit), 0);
    expect(combined).toBe(EVERY_DAY);
  });
});
