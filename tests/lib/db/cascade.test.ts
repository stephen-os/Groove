import { beforeEach, describe, expect, it, vi } from 'vitest';

// The data layer, running its real SQL against a real SQLite (see
// tests/support/expo-sqlite.ts). Everything here was unreachable from the
// verify loop until this file existed.
//
// The subject is deletion. Five of the app's six exclusive transactions delete
// rows whose children are meant to go with them, and they express that as
// `ON DELETE CASCADE` in the schema. Cascades only fire when `foreign_keys` is
// on — and expo-sqlite runs an exclusive transaction on a second connection
// where it is off by default. Every assertion below is about what is left
// behind, because "left behind" is what that failure looks like: no error, no
// warning, just orphans that surface weeks later as a backup that will not
// restore.

/** A fresh module graph, so `client.ts` opens a fresh database each time. */
async function freshDb() {
  vi.resetModules();
  const [profiles, habits, completions, data] = await Promise.all([
    import('@/lib/db/profiles'),
    import('@/lib/db/habits'),
    import('@/lib/db/completions'),
    import('@/lib/db/data'),
  ]);
  const { getDatabase } = await import('@/lib/db/client');
  return { ...profiles, ...habits, ...completions, ...data, getDatabase };
}

type Api = Awaited<ReturnType<typeof freshDb>>;

let api: Api;

const counts = async (): Promise<{ profiles: number; habits: number; completions: number }> => {
  const db = await api.getDatabase();
  const one = async (table: string): Promise<number> => {
    const row = await db.getFirstAsync<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
    return row?.n ?? 0;
  };
  return {
    profiles: await one('profiles'),
    habits: await one('habits'),
    completions: await one('completions'),
  };
};

/** A profile with one habit and one completed day. */
async function seedProfile(name: string): Promise<{ profileId: number; habitId: number }> {
  const profile = await api.createProfile(name);
  const habit = await api.createHabit(profile.id, {
    name: `${name} habit`,
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
  await api.setStatus(habit.id, '2026-08-30', 'done');
  return { profileId: profile.id, habitId: habit.id };
}

beforeEach(async () => {
  api = await freshDb();
});

describe('the schema builds and seeds itself', () => {
  it('opens with exactly one profile and nothing else', async () => {
    expect(await counts()).toEqual({ profiles: 1, habits: 0, completions: 0 });
  });
});

describe('deleteProfile', () => {
  it('takes the profile habits and completions with it', async () => {
    await seedProfile('Work');
    expect(await counts()).toEqual({ profiles: 2, habits: 1, completions: 1 });

    const [, work] = await api.listProfileSummaries();
    expect(work).toBeDefined();
    await api.deleteProfile(work!.id);

    // The orphans are the whole point. A surviving habit has no profile to
    // belong to, rides along in `exportData`'s unfiltered SELECT, and makes
    // every future backup fail its own referential check.
    expect(await counts()).toEqual({ profiles: 1, habits: 0, completions: 0 });
  });

  it('leaves the other profile alone', async () => {
    await seedProfile('Work');
    await seedProfile('Study');
    const summaries = await api.listProfileSummaries();
    expect(summaries).toHaveLength(3);
    await api.deleteProfile(summaries[1]!.id);

    const left = await api.listProfileSummaries();
    expect(left.map((p) => p.name)).toEqual(['Personal', 'Study']);
    expect(await counts()).toEqual({ profiles: 2, habits: 1, completions: 1 });
  });
});

describe('eraseAllData', () => {
  it('leaves one empty profile and nothing else', async () => {
    await seedProfile('Work');
    await seedProfile('Study');
    await api.eraseAllData();
    expect(await counts()).toEqual({ profiles: 1, habits: 0, completions: 0 });
  });
});

describe('resetProfile', () => {
  it('empties the profile but keeps it', async () => {
    const { profileId } = await seedProfile('Work');
    await api.resetProfile(profileId);
    expect(await counts()).toEqual({ profiles: 2, habits: 0, completions: 0 });
  });
});

describe('replaceData', () => {
  it('replaces everything, ids and all', async () => {
    // The failure this pins: the old rows survive the delete, and re-inserting
    // with explicit ids then aborts on `UNIQUE constraint failed: habits.id`.
    // Restore-from-backup is unusable on any device that ever made a habit.
    await seedProfile('Work');

    await api.replaceData({
      profiles: [{ id: 9, name: 'Restored', createdAt: 1 }],
      habits: [
        {
          id: 5,
          profileId: 9,
          name: 'From the file',
          icon: 'ellipse-outline',
          color: '#f08a45',
          scheduleKind: 'daily',
          weekdayMask: 0b1111111,
          targetCount: 1,
          dueTime: null,
          remindEnabled: false,
          followUps: 3,
          targetPct: 80,
          startsOn: '2026-01-01',
          archivedAt: null,
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      completions: [{ id: 3, habitId: 5, day: '2026-08-30', status: 'done', doneAt: 1 }],
    });

    expect(await counts()).toEqual({ profiles: 1, habits: 1, completions: 1 });
    const [only] = await api.listProfileSummaries();
    expect(only?.name).toBe('Restored');
    expect(await api.getActiveProfileId()).toBe(9);
  });
});

describe('the schema refuses states the app cannot represent', () => {
  it('rejects a habit scheduled on no days at all', async () => {
    // Guarded in the form too, but only for daily habits — a flexible one whose
    // day chips were switched off went straight through, looked normal forever,
    // and then failed the backup schema's `min(1)`, taking the whole device's
    // backup with it. One bad row, nothing on screen naming it.
    const db = await api.getDatabase();
    await expect(
      db.runAsync(
        `INSERT INTO habits (profile_id, name, schedule_kind, weekday_mask, starts_on,
                             created_at, updated_at)
         VALUES (1, 'Impossible', 'weekly', 0, '2026-08-30', 0, 0)`
      )
    ).rejects.toThrow();
  });

  it('still accepts every real mask', async () => {
    const db = await api.getDatabase();
    for (const mask of [1, 64, 127]) {
      await expect(
        db.runAsync(
          `INSERT INTO habits (profile_id, name, schedule_kind, weekday_mask, starts_on,
                               created_at, updated_at)
           VALUES (1, ?, 'daily', ?, '2026-08-30', 0, 0)`,
          [`Mask ${mask}`, mask]
        )
      ).resolves.toBeDefined();
    }
  });

  it('refuses a second completion for the same habit on the same day', async () => {
    const { habitId } = await seedProfile('Work');
    const db = await api.getDatabase();
    await expect(
      db.runAsync('INSERT INTO completions (habit_id, day, status, done_at) VALUES (?, ?, ?, ?)', [
        habitId,
        '2026-08-30',
        'done',
        0,
      ])
    ).rejects.toThrow();
  });
});
