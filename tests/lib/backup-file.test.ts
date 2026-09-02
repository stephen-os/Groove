import { beforeEach, describe, expect, it, vi } from 'vitest';

// Export and import, end to end, against a real database and a real filesystem.
//
// This file was at 0% coverage until a coverage report pointed at it, which is
// the whole argument for having one: it is the path that carries habits between
// phones, and every bug in it costs either the transfer or the data.
//
// The round trip is the test that matters. Asserting that an export writes
// *something* proves very little; asserting that what it wrote can be read back
// into the same habits is the promise the feature actually makes.

async function fresh() {
  vi.resetModules();
  const [fs, sharing] = await Promise.all([
    import('expo-file-system'),
    import('expo-sharing'),
  ]);
  const inspect = (sharing as unknown as { inspect: SharingInspect }).inspect;
  inspect.reset();

  const [backupFile, profiles, habits, completions] = await Promise.all([
    import('@/lib/backup-file'),
    import('@/lib/db/profiles'),
    import('@/lib/db/habits'),
    import('@/lib/db/completions'),
  ]);
  const picker = (fs as unknown as { picker: Picker }).picker;
  return { ...backupFile, ...profiles, ...habits, ...completions, inspect, picker };
}

interface SharingInspect {
  shared: () => { uri: string; mimeType?: string }[];
  reset: () => void;
  setAvailable: (next: boolean) => void;
}
interface Picker {
  choose: (uri: string) => void;
  cancel: () => void;
}

type Api = Awaited<ReturnType<typeof fresh>>;
let api: Api;

beforeEach(async () => {
  api = await fresh();
});

/** A habit worth checking survives the trip — every field set to something. */
async function seedHabit(profileId: number, name: string) {
  return api.createHabit(profileId, {
    name,
    icon: '💪',
    color: '#5bd88a',
    scheduleKind: 'weekly',
    weekdayMask: 0b1111111,
    targetCount: 3,
    dueTime: '18:00',
    remindEnabled: true,
    followUps: 2,
    targetPct: 90,
  });
}

/** The file the app last handed to the share sheet. */
const lastShared = (): string => {
  const shared = api.inspect.shared();
  const entry = shared[shared.length - 1];
  if (entry === undefined) throw new Error('Nothing was shared.');
  return entry.uri;
};

describe('exporting', () => {
  it('offers habits with no history, and says so', async () => {
    const profileId = await api.getActiveProfileId();
    const habit = await seedHabit(profileId, 'Gym');
    await api.setStatus(habit.id, '2026-08-30', 'done');

    const outcome = await api.exportHabits();
    expect(outcome).toEqual({ ok: true, message: 'Exported 1 habit(s), without any history.' });
    expect(lastShared()).toMatch(/groove-habits-[\d-]+\.json$/);
  });

  it('offers habits with their history when asked', async () => {
    const profileId = await api.getActiveProfileId();
    const habit = await seedHabit(profileId, 'Gym');
    await api.setStatus(habit.id, '2026-08-30', 'done');

    const outcome = await api.exportProfile();
    expect(outcome.ok).toBe(true);
    expect(outcome.message).toContain('1 completed day');
    expect(lastShared()).toMatch(/groove-profile-[\d-]+\.json$/);
  });

  it('says where the file is when there is nothing to share it with', async () => {
    // A device with no share target still wrote the file, and the path is the
    // only way its owner will ever find it.
    await seedHabit(await api.getActiveProfileId(), 'Gym');
    api.inspect.setAvailable(false);

    const outcome = await api.exportBackup();
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain('.json');
  });
});

describe('the round trip', () => {
  // The promise the feature makes: what came out goes back in unchanged.
  it('brings a habit back with every setting intact', async () => {
    const profileId = await api.getActiveProfileId();
    await seedHabit(profileId, 'Gym');
    await api.exportHabits();

    api.picker.choose(lastShared());
    const file = await api.readImportFile();
    expect(file.ok).toBe(true);
    if (!file.ok) return;

    // The exporting profile is called Personal and so is this device's, so the
    // file cannot land as it is — which is the clash the form exists for.
    expect(file.clashes.map((clash) => clash.name)).toEqual(['Personal']);

    const renamed = new Map(file.clashes.map((clash) => [clash.id, 'From the old phone']));
    const outcome = await api.commitImport(file.data, renamed);
    expect(outcome.ok).toBe(true);

    const landed = (await api.listProfileSummaries()).find(
      (profile) => profile.name === 'From the old phone'
    );
    expect(landed).toBeDefined();

    const [imported] = await api.listHabits(landed!.id);
    expect(imported).toMatchObject({
      name: 'Gym',
      icon: '💪',
      color: '#5bd88a',
      scheduleKind: 'weekly',
      targetCount: 3,
      dueTime: '18:00',
      remindEnabled: true,
      followUps: 2,
      targetPct: 90,
    });
  });

  it('leaves the profile it was imported alongside untouched', async () => {
    const profileId = await api.getActiveProfileId();
    await seedHabit(profileId, 'Gym');
    await api.exportProfile();

    api.picker.choose(lastShared());
    const file = await api.readImportFile();
    if (!file.ok) return;
    await api.commitImport(
      file.data,
      new Map(file.clashes.map((clash) => [clash.id, 'Copy']))
    );

    expect(await api.listHabits(profileId)).toHaveLength(1);
    expect((await api.listProfileSummaries()).map((p) => p.name)).toEqual(['Personal', 'Copy']);
  });

  it('carries the history when the history was exported', async () => {
    const profileId = await api.getActiveProfileId();
    const habit = await seedHabit(profileId, 'Gym');
    await api.setStatus(habit.id, '2026-08-29', 'done');
    await api.setStatus(habit.id, '2026-08-30', 'skipped');
    await api.exportProfile();

    api.picker.choose(lastShared());
    const file = await api.readImportFile();
    if (!file.ok) return;
    const outcome = await api.commitImport(
      file.data,
      new Map(file.clashes.map((clash) => [clash.id, 'Copy']))
    );
    expect(outcome.message).toContain('2 completed day');
  });

  it('carries no history when the history was not exported', async () => {
    const profileId = await api.getActiveProfileId();
    const habit = await seedHabit(profileId, 'Gym');
    await api.setStatus(habit.id, '2026-08-29', 'done');
    await api.exportHabits();

    api.picker.choose(lastShared());
    const file = await api.readImportFile();
    if (!file.ok) return;
    const outcome = await api.commitImport(
      file.data,
      new Map(file.clashes.map((clash) => [clash.id, 'Copy']))
    );
    expect(outcome.message).toContain('no history');
  });
});

describe('importing something that is not a backup', () => {
  it('reports a cancelled pick without complaining', async () => {
    api.picker.cancel();
    const file = await api.readImportFile();
    expect(file).toEqual({ ok: false, message: 'Cancelled.' });
  });

  it('refuses a file that is not JSON', async () => {
    const fs = await import('expo-file-system');
    const junk = new fs.File(fs.Paths.cache, 'notes.json');
    junk.create();
    junk.write('this is not a backup');

    api.picker.choose(junk.uri);
    const file = await api.readImportFile();
    expect(file.ok).toBe(false);
    if (file.ok) return;
    expect(file.message).toContain('not valid JSON');
  });

  it('refuses valid JSON that is not a backup', async () => {
    const fs = await import('expo-file-system');
    const junk = new fs.File(fs.Paths.cache, 'shopping.json');
    junk.create();
    junk.write(JSON.stringify({ milk: true }));

    api.picker.choose(junk.uri);
    const file = await api.readImportFile();
    expect(file.ok).toBe(false);
    if (file.ok) return;
    expect(file.message).toContain('not a valid backup');
  });
});

describe('restoring a whole backup', () => {
  it('replaces every profile with the file', async () => {
    const profileId = await api.getActiveProfileId();
    await seedHabit(profileId, 'Gym');
    await api.createProfile('Work');
    await api.exportBackup();
    const backup = lastShared();

    // Now diverge: another profile, another habit.
    await seedHabit(await api.getActiveProfileId(), 'Yoga');

    api.picker.choose(backup);
    const outcome = await api.importBackup();
    expect(outcome.ok).toBe(true);

    const names = (await api.listProfileSummaries()).map((profile) => profile.name);
    expect(names).toEqual(['Personal', 'Work']);
    expect(await api.listHabits(1)).toHaveLength(1);
  });
});
