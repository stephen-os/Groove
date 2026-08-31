import { beforeEach, describe, expect, it, vi } from 'vitest';
import { parseBackup } from '@/lib/backup';

// The last line of defence before a schema change destroys the database.
//
// The bar is not "it writes a file". It is that the file it writes can be fed
// straight back into Restore — because a rescue the app's own validator rejects
// leaves hand-editing JSON as the only way home, which is not a recovery story
// anybody would actually follow. So every case here reads the file back through
// `parseBackup`, exactly as the Restore button would.

async function fresh() {
  vi.resetModules();
  const [{ writeRescue, listRescues, deleteRescue }, { openDatabaseAsync }, fs] =
    await Promise.all([
      import('@/lib/db/rescue'),
      import('expo-sqlite'),
      import('expo-file-system'),
    ]);
  const { getDatabase } = await import('@/lib/db/client');
  return { writeRescue, listRescues, deleteRescue, openDatabaseAsync, getDatabase, fs };
}

type Api = Awaited<ReturnType<typeof fresh>>;
let api: Api;

beforeEach(async () => {
  api = await fresh();
});

/** Reads back whatever `writeRescue` just wrote, as Restore would. */
async function readRescue(name: string) {
  const { Directory, File, Paths } = api.fs;
  const file = new File(new Directory(Paths.document, 'rescue'), name);
  return parseBackup(await file.text());
}

describe('writeRescue', () => {
  it('writes nothing when there is nothing a person made', async () => {
    // A freshly opened app: the schema seeds one profile and nothing else.
    // Saving that would leave an identical empty file behind after every schema
    // change, which is how the one that matters gets lost among them.
    expect(await api.writeRescue(await api.getDatabase())).toBeNull();
    expect(api.listRescues()).toEqual([]);
  });

  it('saves a second profile even with no habits in it', async () => {
    // A named profile is something someone made, and nothing else on the device
    // records that it existed.
    const { createProfile } = await import('@/lib/db/profiles');
    await createProfile('Work');
    const name = await api.writeRescue(await api.getDatabase());
    expect(name).not.toBeNull();
    const parsed = await readRescue(name!);
    expect(parsed.ok && parsed.backup.profiles.map((p) => p.name)).toEqual(['Personal', 'Work']);
  });

  it('saves a real database in a form Restore accepts', async () => {
    const { createProfile } = await import('@/lib/db/profiles');
    const { createHabit } = await import('@/lib/db/habits');
    const { setStatus } = await import('@/lib/db/completions');

    const profile = await createProfile('Work');
    const habit = await createHabit(profile.id, {
      name: 'Gym',
      icon: '💪',
      color: '#f08a45',
      scheduleKind: 'weekly',
      weekdayMask: 0b1111111,
      targetCount: 3,
      dueTime: '18:00',
      remindEnabled: true,
      followUps: 2,
      targetPct: 90,
    });
    await setStatus(habit.id, '2026-08-29', 'done');
    await setStatus(habit.id, '2026-08-30', 'skipped');

    const name = await api.writeRescue(await api.getDatabase());
    expect(name).toMatch(/^groove-rescue-[\d-]+\.json$/);

    const parsed = await readRescue(name!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.backup.profiles.map((p) => p.name)).toEqual(['Personal', 'Work']);
    const saved = parsed.backup.habits.find((h) => h.name === 'Gym');
    // Every setting, not just the name — the point is to get the habit back as
    // it was configured, not a husk with the right label.
    expect(saved).toMatchObject({
      icon: '💪',
      scheduleKind: 'weekly',
      targetCount: 3,
      dueTime: '18:00',
      remindEnabled: true,
      followUps: 2,
      targetPct: 90,
    });
    expect(parsed.backup.completions.map((c) => c.status).sort()).toEqual(['done', 'skipped']);
  });

  // The whole reason this reads the tables defensively instead of calling
  // exportData: it only ever runs when the database no longer matches the code.
  it('saves what it can from a database the current code does not fit', async () => {
    const db = await api.openDatabaseAsync('ancient.db');
    // An older shape: no icon, colour, follow_ups, target_pct or archived_at,
    // and a due_time column that never existed.
    await db.execAsync(`
      CREATE TABLE profiles (id INTEGER PRIMARY KEY, name TEXT, created_at INTEGER);
      CREATE TABLE habits (
        id INTEGER PRIMARY KEY, profile_id INTEGER, name TEXT,
        schedule_kind TEXT, weekday_mask INTEGER, target_count INTEGER,
        starts_on TEXT, created_at INTEGER, updated_at INTEGER
      );
      CREATE TABLE completions (
        id INTEGER PRIMARY KEY, habit_id INTEGER, day TEXT, status TEXT, done_at INTEGER
      );
      INSERT INTO profiles VALUES (1, 'Personal', 1000);
      INSERT INTO habits VALUES (1, 1, 'Read', 'daily', 127, 1, '2026-01-01', 1, 1);
      INSERT INTO completions VALUES (1, 1, '2026-08-30', 'done', 1);
    `);

    const name = await api.writeRescue(db);
    expect(name).not.toBeNull();

    const parsed = await readRescue(name!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.habits[0]).toMatchObject({ name: 'Read', scheduleKind: 'daily' });
    expect(parsed.backup.completions).toHaveLength(1);
  });

  it('drops the rows that would condemn the whole file', async () => {
    // Every one of these is something parseBackup refuses outright. Losing the
    // bad row beats losing the eleven good ones alongside it.
    const db = await api.openDatabaseAsync('messy.db');
    await db.execAsync(`
      CREATE TABLE profiles (id INTEGER PRIMARY KEY, name TEXT, created_at INTEGER);
      CREATE TABLE habits (
        id INTEGER PRIMARY KEY, profile_id INTEGER, name TEXT, schedule_kind TEXT,
        weekday_mask INTEGER, target_count INTEGER, starts_on TEXT,
        created_at INTEGER, updated_at INTEGER
      );
      CREATE TABLE completions (
        id INTEGER PRIMARY KEY, habit_id INTEGER, day TEXT, status TEXT, done_at INTEGER
      );
      INSERT INTO profiles VALUES (1, 'Personal', 1);
      INSERT INTO profiles VALUES (2, 'personal', 1);          -- name clash, differing only in case
      INSERT INTO habits VALUES (1, 1, 'Keep me', 'daily', 127, 1, '2026-01-01', 1, 1);
      INSERT INTO habits VALUES (2, 99, 'Orphan', 'daily', 127, 1, '2026-01-01', 1, 1);
      INSERT INTO habits VALUES (3, 1, 'No days', 'weekly', 0, 1, '2026-01-01', 1, 1);
      INSERT INTO completions VALUES (1, 1, '2026-08-30', 'done', 1);
      INSERT INTO completions VALUES (2, 1, '2026-08-30', 'done', 1);  -- same habit, same day
      INSERT INTO completions VALUES (3, 77, '2026-08-30', 'done', 1); -- no such habit
    `);

    const name = await api.writeRescue(db);
    const parsed = await readRescue(name!);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.backup.profiles.map((p) => p.name)).toEqual(['Personal']);
    // 'Orphan' belonged to a profile that is gone; 'No days' is kept, with its
    // impossible mask clamped into range rather than dropped.
    expect(parsed.backup.habits.map((h) => h.name).sort()).toEqual(['Keep me', 'No days']);
    expect(parsed.backup.habits.find((h) => h.name === 'No days')?.weekdayMask).toBe(1);
    expect(parsed.backup.completions).toHaveLength(1);
  });

  it('never throws, whatever it is handed', async () => {
    // It runs on the startup path. An app that will not open because it could
    // not back up a database it was about to delete anyway is worse than one
    // that opens.
    const db = await api.openDatabaseAsync('notadb.db');
    await expect(api.writeRescue(db)).resolves.toBeNull();
  });
});

describe('listRescues', () => {
  it('is empty before anything has been rescued', async () => {
    expect(api.listRescues()).toEqual([]);
  });

  it('lists what was written, newest first, and can drop one', async () => {
    const { createProfile } = await import('@/lib/db/profiles');
    await createProfile('Work');
    const db = await api.getDatabase();

    const first = await api.writeRescue(db);
    const second = await api.writeRescue(db);
    // Same second, most likely — the names then collide and the second write
    // overwrites the first, which is correct: they hold identical data.
    const names = api.listRescues().map((entry) => entry.name);
    expect(names).toContain(second);
    expect(new Set(names).size).toBe(names.length);

    api.deleteRescue(first!);
    expect(api.listRescues().map((entry) => entry.name)).not.toContain(first);
  });
});
