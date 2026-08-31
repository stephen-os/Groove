import { beforeEach, describe, expect, it, vi } from 'vitest';

// The demo profile. Everything here is about it staying out of the way of real
// data — it used to erase every habit in whichever profile you happened to be
// standing in, which made a button labelled "demo data" the most destructive
// thing on the Settings screen.

async function fresh() {
  vi.resetModules();
  const [seed, profiles, habits] = await Promise.all([
    import('@/lib/db/seed'),
    import('@/lib/db/profiles'),
    import('@/lib/db/habits'),
  ]);
  const { getDatabase } = await import('@/lib/db/client');
  return { ...seed, ...profiles, ...habits, getDatabase };
}

type Api = Awaited<ReturnType<typeof fresh>>;
let api: Api;

beforeEach(async () => {
  api = await fresh();
});

/** A habit in the profile the app is currently on, so there is something to lose. */
async function realHabit(name: string) {
  const profileId = await api.getActiveProfileId();
  return api.createHabit(profileId, {
    name,
    icon: 'ellipse-outline',
    color: '#f08a45',
    scheduleKind: 'daily',
    weekdayMask: 0b1111111,
    targetCount: 1,
    dueTime: null,
    remindEnabled: false,
    followUps: 3,
    targetPct: 80,
  });
}

describe('demoProfileExists', () => {
  it('is false on a fresh install', async () => {
    expect(await api.demoProfileExists()).toBe(false);
  });

  it('becomes true once the demo is added, and false again when it goes', async () => {
    await api.seedDemoData();
    expect(await api.demoProfileExists()).toBe(true);

    const demo = (await api.listProfileSummaries()).find((p) => p.name === api.DEMO_PROFILE);
    await api.deleteProfile(demo!.id);
    expect(await api.demoProfileExists()).toBe(false);
  });

  // Existence is read from the profile list rather than a stored flag, which is
  // what makes it survive the database being rebuilt from scratch after a
  // schema change: the profile and the answer go together.
  it('is answered by what is actually there', async () => {
    await api.createProfile('Demo');
    expect(await api.demoProfileExists()).toBe(true);
  });

  it('ignores case, as the unique index does', async () => {
    await api.createProfile('demo');
    expect(await api.demoProfileExists()).toBe(true);
  });
});

describe('seedDemoData', () => {
  it('leaves the profile you are in completely alone', async () => {
    const mine = await realHabit('My real habit');
    const before = await api.getActiveProfileId();

    await api.seedDemoData();

    const stillThere = await api.getHabit(mine.id);
    expect(stillThere?.name).toBe('My real habit');
    expect(await api.listHabits(before)).toHaveLength(1);
  });

  it('puts everything in a profile of its own and switches to it', async () => {
    const before = await api.getActiveProfileId();
    const result = await api.seedDemoData();

    const active = await api.getActiveProfileId();
    expect(active).not.toBe(before);

    const summaries = await api.listProfileSummaries();
    const demo = summaries.find((p) => p.id === active);
    expect(demo?.name).toBe(api.DEMO_PROFILE);
    expect(await api.listHabits(active)).toHaveLength(result.habits);
    expect(result.completions).toBeGreaterThan(0);
  });

  // Pressing it twice would otherwise fail on the unique index, and the button
  // that calls this greys out precisely because of this rule.
  it('refuses to add a second one', async () => {
    await api.seedDemoData();
    const after = await api.listProfileSummaries();

    expect(await api.seedDemoData()).toEqual({ habits: 0, completions: 0 });
    expect(await api.listProfileSummaries()).toHaveLength(after.length);
  });

  it('will not write over a profile someone made themselves', async () => {
    // The collision case. Refusing is the safe way round: the alternative is
    // ninety days of invented history landing in a profile they built.
    const mine = await api.createProfile('Demo');
    await realHabit('Something I care about');

    expect(await api.seedDemoData()).toEqual({ habits: 0, completions: 0 });
    expect(await api.listHabits(mine.id)).toHaveLength(1);
  });

  // Demo habits carry due times so Today has more than one time group. Arming
  // them spent Android's one-shot permission prompt on invented habits, and if
  // granted started nagging the next morning about habits that were never real.
  it('never arms a reminder', async () => {
    await api.seedDemoData();
    const demo = await api.listHabits(await api.getActiveProfileId());

    expect(demo.some((habit) => habit.dueTime !== null)).toBe(true);
    expect(demo.every((habit) => habit.remindEnabled === false)).toBe(true);
  });

  it('is the same ninety days every time', async () => {
    const first = await api.seedDemoData();
    const demo = (await api.listProfileSummaries()).find((p) => p.name === api.DEMO_PROFILE);
    await api.deleteProfile(demo!.id);

    expect(await api.seedDemoData()).toEqual(first);
  });
});
