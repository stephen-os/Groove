import { describe, expect, it } from 'vitest';
import { assertMigrationsWellFormed, pendingMigrations } from '@/lib/db/migrate';
import { LATEST_VERSION, migrations, type Migration } from '@/lib/db/schema';

const fake = (version: number): Migration => ({
  version,
  name: `m${version}`,
  statements: ['SELECT 1'],
});

describe('the real migration list', () => {
  it('is well formed', () => {
    // Guards the invariant the runner depends on. A migration added with the
    // wrong version number fails here rather than corrupting a device's schema.
    expect(() => assertMigrationsWellFormed()).not.toThrow();
  });

  it('reports the version a fresh install lands on', () => {
    expect(LATEST_VERSION).toBe(migrations.length);
  });
});

describe('assertMigrationsWellFormed', () => {
  it('rejects a gap in the version sequence', () => {
    expect(() => assertMigrationsWellFormed([fake(1), fake(3)])).toThrow(/expected 2/);
  });

  it('rejects duplicate versions', () => {
    expect(() => assertMigrationsWellFormed([fake(1), fake(1)])).toThrow(/expected 2/);
  });

  it('rejects a list that does not start at 1', () => {
    // `user_version` starts at 0, so a list starting at 2 would leave migration
    // 1 permanently unapplied.
    expect(() => assertMigrationsWellFormed([fake(2)])).toThrow(/expected 1/);
  });

  it('rejects a migration with no statements', () => {
    expect(() =>
      assertMigrationsWellFormed([{ version: 1, name: 'empty', statements: [] }])
    ).toThrow(/no statements/);
  });
});

describe('pendingMigrations', () => {
  const all = [fake(1), fake(2), fake(3)];

  it('returns everything for a fresh database', () => {
    expect(pendingMigrations(0, all).map((m) => m.version)).toEqual([1, 2, 3]);
  });

  it('returns only what has not been applied', () => {
    expect(pendingMigrations(2, all).map((m) => m.version)).toEqual([3]);
  });

  it('returns nothing when already current', () => {
    expect(pendingMigrations(3, all)).toEqual([]);
  });

  it('returns nothing for a database newer than the code', () => {
    // The user downgraded the app. Applying migration 1 over a version-5 schema
    // would try to CREATE TABLE over existing tables and destroy data; doing
    // nothing is the only safe response.
    expect(pendingMigrations(5, all)).toEqual([]);
  });

  it('treats a negative version as a fresh database rather than slicing from the end', () => {
    // Regression guard: `all.slice(-1)` would return the LAST migration only,
    // silently skipping every earlier one on a corrupted user_version.
    expect(pendingMigrations(-1, all).map((m) => m.version)).toEqual([1, 2, 3]);
  });
});
