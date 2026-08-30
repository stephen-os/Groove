import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { runMigrations } from './migrate';

const DATABASE_NAME = 'app.db';

// One connection for the whole app, opened lazily and shared. Held as a promise
// rather than a resolved database so that concurrent callers during startup all
// await the same open-and-migrate rather than racing to run migrations twice.
let connection: Promise<SQLiteDatabase> | null = null;

async function connect(): Promise<SQLiteDatabase> {
  const db = await openDatabaseAsync(DATABASE_NAME);

  // Foreign keys are OFF by default in SQLite and are per-connection, so this
  // has to be set on every open, not once in a migration.
  await db.execAsync('PRAGMA foreign_keys = ON');
  // WAL keeps reads from blocking on a write, which matters as soon as a list
  // screen queries while a save is in flight.
  await db.execAsync('PRAGMA journal_mode = WAL');

  await runMigrations(db);
  return db;
}

/** The shared, migrated database. Safe to call from anywhere, including in parallel. */
export function getDatabase(): Promise<SQLiteDatabase> {
  connection ??= connect();
  return connection;
}
