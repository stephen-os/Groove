import { describe, expect, it } from 'vitest';
import {
  backupFilename,
  BACKUP_FORMAT_VERSION,
  parseBackup,
  serializeBackup,
} from '@/lib/backup';
import type { GrooveData } from '@/lib/db/data';

// The backup file is the app's only untrusted input, so these tests care less
// about the happy path than about every shape of malformed file that could
// otherwise reach the database — especially the ones that would pass field
// validation and then abort a restore half-way through on a constraint.

const data: GrooveData = {
  profiles: [{ id: 1, name: 'Personal', createdAt: 1_700_000_000_000 }],
  habits: [
    {
      id: 1,
      profileId: 1,
      name: 'Brush teeth',
      icon: '',
      color: '',
      sortOrder: 0,
      scheduleKind: 'daily',
      weekdayMask: 127,
      targetCount: 1,
      dueTime: '07:00',
      remindEnabled: true,
      followUps: 3,
      targetPct: 90,
      startsOn: '2026-08-01',
      archivedAt: null,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    },
    {
      id: 2,
      profileId: 1,
      name: 'Gym',
      icon: '',
      color: '',
      sortOrder: 1,
      scheduleKind: 'weekly',
      weekdayMask: 127,
      targetCount: 3,
      dueTime: null,
      remindEnabled: false,
      followUps: 0,
      targetPct: 80,
      startsOn: '2026-08-01',
      archivedAt: null,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
    },
  ],
  completions: [
    { id: 1, habitId: 1, day: '2026-08-29', status: 'done', doneAt: 1_700_000_100_000 },
    { id: 2, habitId: 1, day: '2026-08-30', status: 'skipped', doneAt: 1_700_000_200_000 },
    { id: 3, habitId: 2, day: '2026-08-30', status: 'done', doneAt: 1_700_000_300_000 },
  ],
};

/** A valid backup as a mutable object, for tests that break one thing. */
const validBackup = (): Record<string, unknown> =>
  JSON.parse(serializeBackup(data, 1_700_000_400_000)) as Record<string, unknown>;

const expectRejected = (backup: unknown, fragment: string): void => {
  const result = parseBackup(JSON.stringify(backup));
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toContain(fragment);
};

describe('serializeBackup', () => {
  it('round-trips through parseBackup unchanged', () => {
    const result = parseBackup(serializeBackup(data, 1_700_000_400_000));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.profiles).toEqual(data.profiles);
    expect(result.backup.habits).toEqual(data.habits);
    expect(result.backup.completions).toEqual(data.completions);
    expect(result.backup.exportedAt).toBe(1_700_000_400_000);
    expect(result.backup.formatVersion).toBe(BACKUP_FORMAT_VERSION);
  });

  it('writes indented JSON so a damaged file can be salvaged by hand', () => {
    expect(serializeBackup(data)).toContain('\n  ');
  });
});

describe('parseBackup', () => {
  it('rejects text that is not JSON', () => {
    const result = parseBackup('{ definitely not json');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not valid JSON');
  });

  it('names the version as the reason when the format differs', () => {
    expectRejected({ ...validBackup(), formatVersion: 99 }, 'different app version');
  });

  it('rejects an object that is missing a table', () => {
    const backup = validBackup();
    delete backup.completions;
    expectRejected(backup, 'not a valid backup');
  });

  it('rejects unknown fields rather than silently dropping them', () => {
    expectRejected({ ...validBackup(), surprise: true }, 'not a valid backup');
  });

  it('rejects a day that is not YYYY-MM-DD', () => {
    const backup = validBackup();
    (backup.completions as { day: string }[])[0].day = '30/08/2026';
    expectRejected(backup, 'not a valid backup');
  });

  it('rejects a weekday mask outside one week', () => {
    const backup = validBackup();
    (backup.habits as { weekdayMask: number }[])[0].weekdayMask = 255;
    expectRejected(backup, 'not a valid backup');
  });

  it('rejects a schedule kind the app does not have', () => {
    const backup = validBackup();
    (backup.habits as { scheduleKind: string }[])[0].scheduleKind = 'fortnightly';
    expectRejected(backup, 'not a valid backup');
  });

  it('rejects a malformed due time', () => {
    const backup = validBackup();
    (backup.habits as { dueTime: string | null }[])[0].dueTime = '25:00';
    expectRejected(backup, 'not a valid backup');
  });

  it('accepts a habit with no due time', () => {
    const backup = validBackup();
    (backup.habits as { dueTime: string | null }[])[0].dueTime = null;
    expect(parseBackup(JSON.stringify(backup)).ok).toBe(true);
  });
});

// These are the failures Zod cannot see, because every individual row is
// well-formed. They are also the ones that would abort a restore transaction
// part-way through on a foreign key or a unique index.
describe('parseBackup referential integrity', () => {
  it('rejects a habit belonging to a profile the file does not contain', () => {
    const backup = validBackup();
    (backup.habits as { profileId: number }[])[0].profileId = 7;
    expectRejected(backup, 'profile it does not contain');
  });

  it('rejects a completion for a habit the file does not contain', () => {
    const backup = validBackup();
    (backup.completions as { habitId: number }[])[0].habitId = 99;
    expectRejected(backup, 'habit it does not contain');
  });

  it('rejects the same habit completed twice on one day', () => {
    const backup = validBackup();
    (backup.completions as { habitId: number; day: string }[])[2] = {
      ...(backup.completions as { habitId: number; day: string }[])[2],
      habitId: 1,
      day: '2026-08-30',
    };
    expectRejected(backup, 'twice on one day');
  });

  it('rejects duplicate profile ids', () => {
    const backup = validBackup();
    const profiles = backup.profiles as { id: number; name: string; createdAt: number }[];
    profiles.push({ ...profiles[0] });
    expectRejected(backup, 'duplicate profiles');
  });

  it('rejects duplicate habit ids', () => {
    const backup = validBackup();
    const habits = backup.habits as { id: number }[];
    habits.push({ ...habits[0] });
    expectRejected(backup, 'duplicate habits');
  });

  it('accepts an empty database', () => {
    const empty = serializeBackup({ profiles: [], habits: [], completions: [] });
    expect(parseBackup(empty).ok).toBe(true);
  });
});

describe('backupFilename', () => {
  it('names the app and carries a sortable timestamp', () => {
    expect(backupFilename(new Date(Date.UTC(2026, 7, 30, 14, 5, 9)))).toBe(
      'groove-2026-08-30-14-05-09.json'
    );
  });

  it('contains no characters a filesystem or share sheet would object to', () => {
    expect(backupFilename()).toMatch(/^groove-[\d-]+\.json$/);
  });
});
