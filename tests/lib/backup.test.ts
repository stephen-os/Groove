import { describe, expect, it } from 'vitest';
import {
  backupFilename,
  BACKUP_FORMAT_VERSION,
  MAX_BACKUP_BYTES,
  parseBackup,
  serializeBackup,
  tooLarge,
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

  it('rejects two profiles sharing a name', () => {
    // Mirrors the unique index on profiles(name). A file describing a state the
    // database cannot hold is not a file that can be restored, and finding out
    // mid-restore — after the first profile has already landed — is worse than
    // refusing it up front.
    const backup = validBackup();
    const profiles = backup.profiles as { id: number; name: string; createdAt: number }[];
    profiles.push({ ...profiles[0], id: profiles[0].id + 1 });
    expectRejected(backup, 'same name');
  });

  it('rejects two profile names differing only in case', () => {
    const backup = validBackup();
    const profiles = backup.profiles as { id: number; name: string; createdAt: number }[];
    profiles.push({
      ...profiles[0],
      id: profiles[0].id + 1,
      name: profiles[0].name.toUpperCase(),
    });
    expectRejected(backup, 'same name');
  });

  it('rejects duplicate habit ids', () => {
    const backup = validBackup();
    const habits = backup.habits as { id: number }[];
    habits.push({ ...habits[0] });
    expectRejected(backup, 'duplicate habits');
  });

  it('accepts a profile with nothing in it yet', () => {
    const fresh = serializeBackup({ profiles: data.profiles, habits: [], completions: [] });
    expect(parseBackup(fresh).ok).toBe(true);
  });

  it('refuses a backup with no profile at all', () => {
    // Restoring one would delete every profile and insert none, leaving
    // getActiveProfileId to throw on every call from then on — an app that
    // cannot load any screen and has no way back except erasing everything.
    const none = serializeBackup({ profiles: [], habits: [], completions: [] });
    expect(parseBackup(none).ok).toBe(false);
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
    expect(backupFilename(new Date(), 'habits')).toMatch(/^groove-habits-[\d-]+\.json$/);
  });

  it('tells the three kinds of file apart', () => {
    // They land in the same downloads folder and are otherwise identical until
    // you open one: habits alone, one profile with its history, everything.
    const at = new Date(Date.UTC(2026, 7, 30, 14, 5, 9));
    expect(backupFilename(at, 'habits')).toBe('groove-habits-2026-08-30-14-05-09.json');
    expect(backupFilename(at, 'profile')).toBe('groove-profile-2026-08-30-14-05-09.json');
    expect(backupFilename(at)).toBe('groove-2026-08-30-14-05-09.json');
  });
});


// The per-field bounds only bite once the file is a string in memory. This is
// the same ceiling in a form that can be checked before a byte is read.
describe('tooLarge', () => {
  it('accepts a file at the limit', () => {
    expect(tooLarge(MAX_BACKUP_BYTES)).toBe(false);
  });

  it('rejects one byte over', () => {
    expect(tooLarge(MAX_BACKUP_BYTES + 1)).toBe(true);
  });

  it('rejects an absurd file outright', () => {
    expect(tooLarge(2 * 1024 * 1024 * 1024)).toBe(true);
  });

  it('accepts an unknown size rather than refusing every vague provider', () => {
    expect(tooLarge(null)).toBe(false);
    expect(tooLarge(undefined)).toBe(false);
  });

  it('leaves room for a maximal legitimate export', () => {
    // 200,000 completions of indented JSON come to roughly 28MB.
    expect(MAX_BACKUP_BYTES).toBeGreaterThan(29 * 1024 * 1024);
  });
});


// The shape check alone let a far-past or impossible date through, and the
// statistics walk day by day from startsOn.
describe('parseBackup day validation', () => {
  const withStart = (startsOn: string): Record<string, unknown> => {
    const backup = validBackup();
    (backup.habits as { startsOn: string }[])[0].startsOn = startsOn;
    return backup;
  };

  it('refuses a year far in the past', () => {
    expectRejected(withStart('1000-01-01'), 'not a valid backup');
  });

  it('refuses a day that does not exist', () => {
    expectRejected(withStart('2026-02-31'), 'not a valid backup');
    expectRejected(withStart('2026-13-01'), 'not a valid backup');
  });

  it('accepts a leap day in a leap year', () => {
    expect(parseBackup(JSON.stringify(withStart('2028-02-29'))).ok).toBe(true);
  });

  it('refuses a habit scheduled on no days at all', () => {
    const backup = validBackup();
    (backup.habits as { weekdayMask: number }[])[0].weekdayMask = 0;
    expectRejected(backup, 'not a valid backup');
  });
});
