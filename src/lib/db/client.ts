import { deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { schemaFingerprint, SCHEMA } from './schema';

const DATABASE_NAME = 'groove.db';

// One connection for the whole app, opened lazily and shared. Held as a promise
// rather than a resolved database so that concurrent callers during startup all
// await the same open-and-build rather than racing to create tables twice.
let connection: Promise<SQLiteDatabase> | null = null;

/**
 * Opens the database, rebuilding it from scratch if it does not match `SCHEMA`.
 *
 * The fingerprint of the current schema is kept in SQLite's `user_version`
 * pragma. On a match — the overwhelmingly common case — this is one cheap read
 * and nothing else happens.
 *
 * On a mismatch the database file is deleted and recreated rather than altered.
 * That is a deliberate trade for an app still being built: there is no shipped
 * version whose data has to survive, and a database that has silently diverged
 * from the code costs far more to debug than a habit list costs to retype. The
 * export in Settings is there for when the data does matter.
 */
async function connect(): Promise<SQLiteDatabase> {
  let db = await openDatabaseAsync(DATABASE_NAME);

  const expected = schemaFingerprint();
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');

  if ((row?.user_version ?? 0) !== expected) {
    // Delete rather than dropping table by table: `PRAGMA foreign_keys` is a
    // no-op inside a transaction, so dropping in place would either fail on the
    // cascades or need the tables ordered by dependency and kept that way.
    await db.closeAsync();
    await deleteDatabaseAsync(DATABASE_NAME);
    db = await openDatabaseAsync(DATABASE_NAME);

    // Not exclusive, and safe: nothing else can be issuing SQL yet. Callers all
    // await the single memoised `connect()` promise, so this runs before the
    // connection is visible to anyone.
    await db.withTransactionAsync(async () => {
      for (const statement of SCHEMA) {
        await db.execAsync(statement);
      }
      // `PRAGMA user_version = ?` cannot be parameterised, so the value has to
      // be interpolated. It comes from our own hash, but this asserts it is an
      // integer anyway — an interpolated value reaching a PRAGMA is exactly the
      // shape of an injection, and a cheap guard keeps it from becoming one.
      if (!Number.isInteger(expected)) {
        throw new Error(`Refusing to write a non-integer schema fingerprint: ${expected}`);
      }
      await db.execAsync(`PRAGMA user_version = ${expected}`);
    });
  }

  // Foreign keys are OFF by default in SQLite and are per-connection, so this
  // has to be set on every open, not once when the tables are created.
  await db.execAsync('PRAGMA foreign_keys = ON');
  // WAL keeps reads from blocking on a write, which matters as soon as a list
  // screen queries while a save is in flight.
  await db.execAsync('PRAGMA journal_mode = WAL');

  return db;
}

/**
 * The shared, ready database. Safe to call from anywhere, including in parallel.
 *
 * A failure clears the memo. Holding on to a rejected promise meant one
 * transient problem — a locked file mid-rebuild, a bad statement — rejected
 * every later call for the life of the process, and since most callers only
 * warn, the app went quietly empty rather than saying anything.
 */
export function getDatabase(): Promise<SQLiteDatabase> {
  connection ??= connect().catch((error: unknown) => {
    connection = null;
    throw error;
  });
  return connection;
}
