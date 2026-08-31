import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type StatementResultingChanges } from 'node:sqlite';

// A stand-in for expo-sqlite, backed by Node's built-in SQLite.
//
// The point is not to mock the database away — it is to run the *real* SQL
// against a real SQLite, so `src/lib/db` can be tested without a device. Before
// this existed the whole data layer was unreachable from `npm run verify`, and
// that is exactly where the worst bug in the app was hiding.
//
// The fidelity that matters is `withExclusiveTransactionAsync`. expo-sqlite
// implements it by opening a SECOND connection (`useNewConnection: true`,
// SQLiteDatabase.js) and never sets `foreign_keys` on it — and SQLite defaults
// that pragma OFF, per connection. So inside one of those transactions every
// ON DELETE CASCADE is inert. A shim that reused the first connection would
// quietly pass tests that the real app fails, which is worse than no shim at
// all, so this one opens a second connection too.
//
// `enableForeignKeyConstraints: false` on every connection is part of that, and
// it is not an opinion about what the app should do. Node's DatabaseSync turns
// foreign keys ON by default where SQLite itself leaves them off, so leaving it
// at the default made this shim *hide* the exact bug it was written to expose:
// the first run of these tests passed against a codebase that was broken on a
// real device. The app's own `PRAGMA foreign_keys = ON` in client.ts is what
// turns them on here, on precisely the connection it turns them on there.
//
// Registered as an alias in vitest.config.ts.

/** Temp file per database name. Reset with `vi.resetModules()` between tests. */
const files = new Map<string, string>();

function pathFor(name: string): string {
  const existing = files.get(name);
  if (existing !== undefined) return existing;
  const file = join(mkdtempSync(join(tmpdir(), 'groove-test-')), name);
  files.set(name, file);
  return file;
}

/** As SQLite opens a connection, rather than as Node prefers to. */
const connect = (file: string): DatabaseSync =>
  new DatabaseSync(file, { enableForeignKeyConstraints: false });

/** node:sqlite takes primitives only; expo passes booleans and undefined through. */
const bind = (params: readonly unknown[]): (string | number | bigint | null | Uint8Array)[] =>
  params.map((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value as string | number | bigint | Uint8Array;
  });

export class SQLiteDatabase {
  constructor(
    private readonly file: string,
    private readonly handle: DatabaseSync
  ) {}

  async execAsync(sql: string): Promise<void> {
    this.handle.exec(sql);
  }

  async runAsync(
    sql: string,
    params: readonly unknown[] = []
  ): Promise<{ lastInsertRowId: number; changes: number }> {
    const result: StatementResultingChanges = this.handle.prepare(sql).run(...bind(params));
    return {
      lastInsertRowId: Number(result.lastInsertRowid),
      changes: Number(result.changes),
    };
  }

  async getAllAsync<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    return this.handle.prepare(sql).all(...bind(params)) as T[];
  }

  async getFirstAsync<T>(sql: string, params: readonly unknown[] = []): Promise<T | null> {
    // expo returns null for a miss; node:sqlite returns undefined.
    return (this.handle.prepare(sql).get(...bind(params)) as T | undefined) ?? null;
  }

  async closeAsync(): Promise<void> {
    this.handle.close();
  }

  /** Same connection, so whatever pragmas it carries stay in force. */
  async withTransactionAsync(task: () => Promise<void>): Promise<void> {
    this.handle.exec('BEGIN');
    try {
      await task();
      this.handle.exec('COMMIT');
    } catch (error) {
      this.handle.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * A second connection, matching expo-sqlite — and therefore one on which
   * `foreign_keys` is OFF unless something turns it on.
   */
  async withExclusiveTransactionAsync(
    task: (txn: SQLiteDatabase) => Promise<void>
  ): Promise<void> {
    const other = connect(this.file);
    const txn = new SQLiteDatabase(this.file, other);
    other.exec('BEGIN IMMEDIATE');
    try {
      await task(txn);
      other.exec('COMMIT');
    } catch (error) {
      other.exec('ROLLBACK');
      throw error;
    } finally {
      other.close();
    }
  }
}

export async function openDatabaseAsync(name: string): Promise<SQLiteDatabase> {
  const file = pathFor(name);
  return new SQLiteDatabase(file, connect(file));
}

export async function deleteDatabaseAsync(name: string): Promise<void> {
  // The app deletes to rebuild. Pointing the name at a fresh temp file is the
  // same thing from the caller's side and avoids unlink races on Windows.
  files.delete(name);
  pathFor(name);
}
