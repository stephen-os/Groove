import { describe, expect, it } from 'vitest';
import { EVERY_DAY } from '@/lib/date';
import type { Completion } from '@/lib/db/completions';
import type { GrooveData } from '@/lib/db/data';
import type { Habit } from '@/lib/db/habits';
import type { Profile } from '@/lib/db/profiles';
import {
  clashingProfiles,
  isNameTaken,
  planImport,
  scopeToProfile,
  stripHistory,
} from '@/lib/transfer';

const TODAY = '2026-08-31';

const profile = (id: number, name: string): Profile => ({ id, name, createdAt: 1000 });

const habit = (id: number, profileId: number, overrides: Partial<Habit> = {}): Habit => ({
  id,
  profileId,
  name: `Habit ${id}`,
  icon: 'ellipse-outline',
  color: '#f08a45',
  scheduleKind: 'daily',
  weekdayMask: EVERY_DAY,
  targetCount: 1,
  dueTime: null,
  remindEnabled: false,
  followUps: 3,
  targetPct: 80,
  startsOn: '2024-01-01',
  archivedAt: null,
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

const completion = (id: number, habitId: number, day: string): Completion => ({
  id,
  habitId,
  day,
  status: 'done',
  doneAt: 0,
});

const data = (): GrooveData => ({
  profiles: [profile(1, 'Personal'), profile(2, 'Work')],
  habits: [habit(10, 1), habit(11, 1), habit(20, 2)],
  completions: [
    completion(100, 10, '2026-08-01'),
    completion(101, 10, '2026-08-02'),
    completion(102, 20, '2026-08-01'),
  ],
});

describe('scopeToProfile', () => {
  it('keeps one profile and its habits', () => {
    const scoped = scopeToProfile(data(), 1);
    expect(scoped.profiles.map((p) => p.name)).toEqual(['Personal']);
    expect(scoped.habits.map((h) => h.id)).toEqual([10, 11]);
  });

  it('keeps only the completions belonging to those habits', () => {
    // Completions reference a habit, not a profile, so filtering them by
    // profile means going through the habits. Getting this wrong would export
    // the other profile's history inside this profile's file.
    const scoped = scopeToProfile(data(), 1);
    expect(scoped.completions.map((c) => c.id)).toEqual([100, 101]);
  });

  it('is empty for a profile that does not exist', () => {
    const scoped = scopeToProfile(data(), 99);
    expect(scoped).toEqual({ profiles: [], habits: [], completions: [] });
  });
});

describe('stripHistory', () => {
  it('drops every completion', () => {
    expect(stripHistory(data(), TODAY).completions).toEqual([]);
  });

  it('moves every habit to today, so the file arrives with a clean slate', () => {
    // The one that matters. A habit remembers when it began and the statistics
    // measure against every scheduled day since — so carrying a 2024 start date
    // onto a phone with no history would score the new owner as having missed
    // eighteen months before they started.
    const stripped = stripHistory(data(), TODAY);
    for (const entry of stripped.habits) expect(entry.startsOn).toBe(TODAY);
  });

  it('leaves the rest of a habit exactly as it was', () => {
    const original = habit(10, 1, {
      name: 'Gym',
      dueTime: '18:00',
      remindEnabled: true,
      followUps: 2,
      targetPct: 90,
      scheduleKind: 'weekly',
      targetCount: 3,
    });
    const [moved] = stripHistory(
      { profiles: [profile(1, 'Personal')], habits: [original], completions: [] },
      TODAY
    ).habits;
    expect(moved).toEqual({ ...original, startsOn: TODAY });
  });

  it('drops archived habits, which have nothing left to say', () => {
    const source: GrooveData = {
      profiles: [profile(1, 'Personal')],
      habits: [habit(10, 1), habit(11, 1, { archivedAt: 500 })],
      completions: [],
    };
    expect(stripHistory(source, TODAY).habits.map((h) => h.id)).toEqual([10]);
  });

  it('keeps the profile itself', () => {
    expect(stripHistory(data(), TODAY).profiles).toHaveLength(2);
  });
});

describe('planImport', () => {
  it('nests each habit under its profile', () => {
    const plan = planImport(data());
    expect(plan.map((p) => p.name)).toEqual(['Personal', 'Work']);
    expect(plan[0]?.habits).toHaveLength(2);
    expect(plan[1]?.habits).toHaveLength(1);
  });

  it('nests each completion under its habit', () => {
    const plan = planImport(data());
    expect(plan[0]?.habits[0]?.completions.map((c) => c.day)).toEqual([
      '2026-08-01',
      '2026-08-02',
    ]);
    expect(plan[0]?.habits[1]?.completions).toEqual([]);
    expect(plan[1]?.habits[0]?.completions.map((c) => c.day)).toEqual(['2026-08-01']);
  });

  // The reason the plan is nested at all: an id in a file belongs to the phone
  // that wrote it and cannot survive beside rows that already exist here. A plan
  // that still carried them would have to be renumbered, and a renumbering is
  // one wrong lookup away from filing a year of history under someone else's
  // habit. There is nothing here to renumber.
  it('carries no ids at all', () => {
    const plan = planImport(data());
    for (const entry of plan) {
      for (const habitPlan of entry.habits) {
        expect(habitPlan).not.toHaveProperty('id');
        expect(habitPlan).not.toHaveProperty('profileId');
        for (const done of habitPlan.completions) {
          expect(done).not.toHaveProperty('id');
          expect(done).not.toHaveProperty('habitId');
        }
      }
    }
  });

  it('keeps everything about a habit that is not an id', () => {
    const source: GrooveData = {
      profiles: [profile(1, 'Personal')],
      habits: [habit(10, 1, { name: 'Gym', dueTime: '18:00', targetPct: 90 })],
      completions: [],
    };
    expect(planImport(source)[0]?.habits[0]).toEqual({
      name: 'Gym',
      icon: 'ellipse-outline',
      color: '#f08a45',
      scheduleKind: 'daily',
      weekdayMask: EVERY_DAY,
      targetCount: 1,
      dueTime: '18:00',
      remindEnabled: false,
      followUps: 3,
      targetPct: 90,
      startsOn: '2024-01-01',
      archivedAt: null,
      createdAt: 0,
      updatedAt: 0,
      completions: [],
    });
  });

  it('handles a habits-only file', () => {
    const plan = planImport(stripHistory(scopeToProfile(data(), 1), TODAY));
    expect(plan).toHaveLength(1);
    expect(plan[0]?.habits).toHaveLength(2);
    expect(plan[0]?.habits.every((h) => h.completions.length === 0)).toBe(true);
  });

  it('ignores a completion whose habit is not in the file', () => {
    // parseBackup rejects these before an import ever gets here. Belt and
    // braces: silently dropping one is survivable, attaching it to the wrong
    // habit is not.
    const source: GrooveData = {
      profiles: [profile(1, 'Personal')],
      habits: [habit(10, 1)],
      completions: [completion(100, 10, '2026-08-01'), completion(101, 999, '2026-08-01')],
    };
    expect(planImport(source)[0]?.habits[0]?.completions).toHaveLength(1);
  });

  it('produces an empty profile rather than dropping it', () => {
    const source: GrooveData = {
      profiles: [profile(1, 'Empty')],
      habits: [],
      completions: [],
    };
    expect(planImport(source)).toEqual([{ name: 'Empty', createdAt: 1000, habits: [] }]);
  });
});

describe('isNameTaken', () => {
  it('spots an exact match', () => {
    expect(isNameTaken('Personal', ['Work', 'Personal'])).toBe(true);
    expect(isNameTaken('Personal', ['Work'])).toBe(false);
  });

  // Case and stray space are the whole reason this is a function rather than a
  // Set lookup. "Personal" above "personal" in a switcher asks you to tell apart
  // two things that read identically, which is the failure the rule prevents.
  it('ignores case', () => {
    expect(isNameTaken('personal', ['Personal'])).toBe(true);
    expect(isNameTaken('PERSONAL', ['Personal'])).toBe(true);
  });

  it('ignores surrounding space', () => {
    expect(isNameTaken('  Personal  ', ['Personal'])).toBe(true);
    expect(isNameTaken('Personal', ['  Personal '])).toBe(true);
  });

  it('does not match a different name that merely contains it', () => {
    expect(isNameTaken('Personal', ['Personal stuff'])).toBe(false);
  });

  it('is false against nothing', () => {
    expect(isNameTaken('Personal', [])).toBe(false);
  });
});

describe('clashingProfiles', () => {
  it('finds nothing when the names are free', () => {
    expect(clashingProfiles(data(), ['Gym', 'Study'])).toEqual([]);
  });

  it('reports the profile that collides, with the id it has in the file', () => {
    expect(clashingProfiles(data(), ['Personal'])).toEqual([{ id: 1, name: 'Personal' }]);
  });

  it('reports every collision', () => {
    expect(clashingProfiles(data(), ['personal', 'WORK'])).toEqual([
      { id: 1, name: 'Personal' },
      { id: 2, name: 'Work' },
    ]);
  });

  it('catches two profiles inside one file sharing a name', () => {
    // parseBackup rejects such a file, so this is the second line of defence.
    // Without it the first insert would succeed and the second would abort the
    // transaction on the unique index, after the question could have been asked.
    const source: GrooveData = {
      profiles: [profile(1, 'Personal'), profile(2, 'personal')],
      habits: [],
      completions: [],
    };
    expect(clashingProfiles(source, [])).toEqual([{ id: 2, name: 'personal' }]);
  });
});

describe('planImport renaming', () => {
  it('uses the name from the file when nothing is chosen', () => {
    expect(planImport(data())[0]?.name).toBe('Personal');
  });

  it('applies a chosen name, keyed by the id in the file', () => {
    const plan = planImport(data(), new Map([[1, 'Phone']]));
    expect(plan.map((entry) => entry.name)).toEqual(['Phone', 'Work']);
  });

  it('renames without disturbing what is underneath', () => {
    const plan = planImport(data(), new Map([[1, 'Phone']]));
    expect(plan[0]?.habits).toHaveLength(2);
    expect(plan[0]?.habits[0]?.completions).toHaveLength(2);
  });

  it('ignores an id the file does not contain', () => {
    expect(planImport(data(), new Map([[99, 'Nowhere']])).map((e) => e.name)).toEqual([
      'Personal',
      'Work',
    ]);
  });
});
