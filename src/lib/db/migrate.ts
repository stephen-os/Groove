import type { SQLiteDatabase } from 'expo-sqlite';
import { migrations, type Migration } from './schema';

/**
 * Checks the migration list is internally consistent.
 *
 * Versions must start at 1 and increase by exactly 1, because the runner treats
 * `user_version` as "every migration up to and including N has been applied".
 * A gap or a duplicate breaks that assumption and would silently skip a
 * migration on some devices and not others.
 *
 * Called by the runner at startup and asserted in tests, so a malformed list
 * fails immediately and loudly rather than corrupting a schema in the field.
 */
export function assertMigrationsWellFormed(all: readonly Migration[] = migrations): void {
  all.forEach((migration, index) => {
    const expected = index + 1;
    if (migration.version !== expected) {
      throw new Error(
        `Migration at index ${index} ("${migration.name}") has version ${migration.version}, expected ${expected}. Migrations must be contiguous and start at 1.`
      );
    }
    if (migration.statements.length === 0) {
      throw new Error(`Migration ${migration.version} ("${migration.name}") has no statements.`);
    }
  });
}

/**
 * The migrations still to apply, in order, given the schema version on disk.
 *
 * Pure by design: this is the decision the whole migration system rests on, and
 * keeping it free of SQLite means it can be tested exhaustively in plain Node —
 * including the cases that are painful to reproduce on a device, like a database
 * from a future app version.
 */
export function pendingMigrations(
  currentVersion: number,
  all: readonly Migration[] = migrations
): readonly Migration[] {
  // A database newer than the code means the user downgraded the app. Applying
  // nothing is the only safe move: we cannot know what a future migration did,
  // and guessing risks destroying data the newer version wrote.
  if (currentVersion >= all.length) return [];
  return all.slice(Math.max(currentVersion, 0));
}

/**
 * Brings the database up to the latest schema version.
 *
 * 1. Validate the migration list before touching anything.
 * 2. Read the version already on disk.
 * 3. Apply each pending migration inside its own transaction, bumping the
 *    version in the same transaction so a crash mid-way can never leave a
 *    half-applied schema recorded as complete.
 */
export async function runMigrations(db: SQLiteDatabase): Promise<number> {
  assertMigrationsWellFormed();

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const currentVersion = row?.user_version ?? 0;
  const pending = pendingMigrations(currentVersion);

  for (const migration of pending) {
    // `PRAGMA user_version = ?` is not parameterizable, so the value has to be
    // interpolated. It comes from our own migration list, but this asserts it is
    // an integer anyway — an interpolated string reaching a PRAGMA is exactly the
    // shape of an injection, and a cheap guard keeps it from ever becoming one.
    if (!Number.isInteger(migration.version)) {
      throw new Error(`Refusing to apply migration with non-integer version: ${migration.version}`);
    }

    await db.withTransactionAsync(async () => {
      for (const statement of migration.statements) {
        await db.execAsync(statement);
      }
      await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }

  return currentVersion + pending.length;
}
