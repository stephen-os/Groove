import { addDays, maskIncludes, todayKey } from '../date';
import { getDatabase } from './client';
import { getActiveProfileId } from './profiles';

// Demo data, for looking at screens that need a history to say anything.
//
// The analytics, the streaks and the calendar are all meaningless against an
// empty database, and typing ninety days of ticks by hand to see whether a
// chart looks right is not a reasonable way to spend an evening.
//
// It is deterministic: the same ninety days every time, so a screenshot taken
// today can be compared with one taken after a change. Nothing here is random.

const DAYS = 90;

interface Template {
  readonly name: string;
  readonly icon: string;
  readonly color: string;
  readonly scheduleKind: 'daily' | 'weekly' | 'monthly';
  readonly weekdayMask: number;
  readonly targetCount: number;
  readonly dueTime: string | null;
  readonly followUps: number;
  readonly targetPct: number;
  /** Roughly what share of its opportunities this habit hits, 0–1. */
  readonly rate: number;
}

const EVERY_DAY = 0b1111111;
const MON_TO_FRI = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5);
const MON_TO_THU = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4);
const WEEKENDS = (1 << 0) | (1 << 6);

/**
 * A spread wide enough to exercise every screen.
 *
 * Deliberately mixed: something near-perfect, something failing, one habit on
 * each schedule kind, some with due times and some without, so the Today screen
 * has more than one time group and the analytics have both ends of the grade.
 */
const TEMPLATES: readonly Template[] = [
  { name: 'Brush teeth', icon: '🦷', color: '#4ecdc4', scheduleKind: 'daily', weekdayMask: EVERY_DAY, targetCount: 1, dueTime: '07:00', followUps: 3, targetPct: 90, rate: 0.96 },
  { name: 'Vitamins', icon: '💊', color: '#f2c94c', scheduleKind: 'daily', weekdayMask: EVERY_DAY, targetCount: 1, dueTime: '07:00', followUps: 1, targetPct: 80, rate: 0.82 },
  { name: 'Make the bed', icon: '🛏️', color: '#b48ef0', scheduleKind: 'daily', weekdayMask: EVERY_DAY, targetCount: 1, dueTime: null, followUps: 0, targetPct: 70, rate: 0.68 },
  { name: 'Gym', icon: '💪', color: '#ff8a3d', scheduleKind: 'daily', weekdayMask: MON_TO_THU, targetCount: 1, dueTime: '18:00', followUps: 2, targetPct: 80, rate: 0.74 },
  { name: 'Read', icon: '📚', color: '#6db3f2', scheduleKind: 'daily', weekdayMask: EVERY_DAY, targetCount: 1, dueTime: '21:30', followUps: 0, targetPct: 80, rate: 0.55 },
  { name: 'Stand-up notes', icon: '✍️', color: '#5bd88a', scheduleKind: 'daily', weekdayMask: MON_TO_FRI, targetCount: 1, dueTime: '09:00', followUps: 1, targetPct: 90, rate: 0.9 },
  { name: 'Long walk', icon: '🏃', color: '#5bd88a', scheduleKind: 'daily', weekdayMask: WEEKENDS, targetCount: 1, dueTime: null, followUps: 0, targetPct: 70, rate: 0.6 },
  { name: 'Call home', icon: '📞', color: '#f98a8a', scheduleKind: 'weekly', weekdayMask: EVERY_DAY, targetCount: 1, dueTime: null, followUps: 0, targetPct: 80, rate: 0.78 },
  { name: 'Deep clean', icon: '🧹', color: '#b48ef0', scheduleKind: 'monthly', weekdayMask: EVERY_DAY, targetCount: 2, dueTime: null, followUps: 0, targetPct: 70, rate: 0.65 },
];

/**
 * A stable pseudo-random number in [0,1) for one habit on one day.
 *
 * Seeded from the two things that identify the slot, so the same day always
 * gets the same answer — a reseed produces an identical history rather than a
 * new one, which is what makes before-and-after screenshots comparable.
 *
 * mulberry32 over a mixed seed, rather than the fractional part of a scaled
 * sine — the same idea, but with a distribution that holds up across the range
 * rather than clumping.
 */
function jitter(index: number, offset: number): number {
  let seed = (index * 0x9e3779b1 + offset * 0x85ebca6b) >>> 0;
  seed = (seed + 0x6d2b79f5) >>> 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Replaces the active profile's habits with a worked ninety-day history.
 *
 * Destructive on purpose: seeding on top of existing habits would leave a
 * muddle nobody can reason about. One transaction, so a failure leaves the
 * profile as it was.
 */
export async function seedDemoData(): Promise<{ habits: number; completions: number }> {
  const db = await getDatabase();
  const profileId = await getActiveProfileId();
  const today = todayKey();
  const start = addDays(today, -(DAYS - 1));
  const now = Date.now();

  let completions = 0;

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM habits WHERE profile_id = ?', [profileId]);

    for (const [index, template] of TEMPLATES.entries()) {
      const result = await db.runAsync(
        `INSERT INTO habits (
           profile_id, name, icon, color, schedule_kind, weekday_mask, target_count,
           due_time, remind_enabled, follow_ups, target_pct, starts_on,
           created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          profileId,
          template.name,
          template.icon,
          template.color,
          template.scheduleKind,
          template.weekdayMask,
          template.targetCount,
          template.dueTime,
          template.dueTime === null ? 0 : 1,
          template.followUps,
          template.targetPct,
          start,
          now,
          now,
        ]
      );
      const habitId = result.lastInsertRowId;

      for (let offset = 0; offset < DAYS; offset += 1) {
        const day = addDays(start, offset);

        // Today is left untouched, so the Today screen opens with something to
        // actually tick rather than a list that is already finished.
        if (day >= today) continue;

        // Only tick days the habit was actually due, or the history would
        // disagree with the schedule engine the moment a screen reads it.
        if (template.scheduleKind === 'daily' && !maskIncludes(template.weekdayMask, day)) {
          continue;
        }
        // Flexible habits get a couple of days a week rather than every day.
        if (template.scheduleKind !== 'daily' && offset % 3 !== 0) continue;

        const roll = jitter(index, offset);
        // A fifth of whatever miss probability is left becomes a deliberate
        // skip, so the skip paths have something to show.
        //
        // A fifth *of the remainder*, not a fixed slice: a flat `rate + 0.06`
        // reaches past 1.0 once the rate is above 0.94, which turned every miss
        // for a 96% habit into a skip. Skips leave the denominator, so the
        // habit came out at a flawless 86 of 86 with an unbroken streak — demo
        // data that could not show a miss at all.
        const skipBelow = template.rate + (1 - template.rate) * 0.2;
        if (roll < template.rate) {
          await db.runAsync(
            'INSERT INTO completions (habit_id, day, status, done_at) VALUES (?, ?, ?, ?)',
            [habitId, day, 'done', now]
          );
          completions += 1;
        } else if (roll < skipBelow) {
          await db.runAsync(
            'INSERT INTO completions (habit_id, day, status, done_at) VALUES (?, ?, ?, ?)',
            [habitId, day, 'skipped', now]
          );
          completions += 1;
        }
      }
    }
  });

  return { habits: TEMPLATES.length, completions };
}
