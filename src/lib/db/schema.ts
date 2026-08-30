// The database schema, expressed as an ordered list of migrations.
//
// This list is append-only. Never edit or reorder a migration that has shipped:
// a device that already ran migration 1 will never run it again, so changing it
// changes the schema on new installs only, and the two silently diverge. To fix
// a mistake, add a new migration that corrects it.
//
// The applied version is tracked in SQLite's own `user_version` pragma rather
// than a bookkeeping table — it costs nothing, it is atomic with the schema
// change inside a transaction, and there is no table to forget to create.

export interface Migration {
  /** 1-based, contiguous, and matching this entry's position in `migrations`. */
  readonly version: number;
  readonly name: string;
  /** Executed in order inside a single transaction with the version bump. */
  readonly statements: readonly string[];
}

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: 'create_items',
    statements: [
      // An autoincrement integer id, not a UUID: this database never syncs with
      // another device, so SQLite can own identity and the app needs no id
      // generator and no crypto dependency. Restore replaces the whole table and
      // preserves ids, so they stay stable across a backup round-trip.
      `CREATE TABLE items (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        title       TEXT    NOT NULL,
        body        TEXT    NOT NULL DEFAULT '',
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL
      )`,
      // Every list view is ordered newest-first; without this the app table-scans
      // and re-sorts on each render once the table is non-trivial.
      `CREATE INDEX idx_items_created_at ON items (created_at DESC)`,
    ],
  },
  {
    version: 2,
    name: 'create_settings',
    statements: [
      `CREATE TABLE settings (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 3,
    name: 'add_item_reminder',
    statements: [
      // Nullable: most items have no reminder. Stored as epoch milliseconds to
      // match created_at, so all time comparisons use one unit.
      `ALTER TABLE items ADD COLUMN remind_at INTEGER`,
      // The scheduled OS notification id, so a reminder can be cancelled when
      // its item is deleted. Null when no reminder is set.
      `ALTER TABLE items ADD COLUMN notification_id TEXT`,
    ],
  },
];

/** The schema version a fresh install ends up at. */
export const LATEST_VERSION = migrations.length;
