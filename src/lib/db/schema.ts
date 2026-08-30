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
    name: 'create_groove_schema',
    statements: [
      // Profiles are the app's answer to "personal habits vs work habits"
      // without an account system: separate habit lists in one database, one
      // active at a time. Deleting a profile takes its habits and their history
      // with it, which is why every child table cascades.
      `CREATE TABLE profiles (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       TEXT    NOT NULL,
        created_at INTEGER NOT NULL
      )`,

      `CREATE TABLE habits (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        profile_id     INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        name           TEXT    NOT NULL,
        icon           TEXT    NOT NULL DEFAULT '',
        color          TEXT    NOT NULL DEFAULT '',
        sort_order     INTEGER NOT NULL DEFAULT 0,
        -- 'daily' | 'weekly' | 'monthly'. Daily reads weekday_mask; weekly and
        -- monthly read target_count and ignore the mask entirely.
        schedule_kind  TEXT    NOT NULL,
        -- Bitmask indexed by JavaScript's Date.getDay(): bit 0 is Sunday
        -- through bit 6 is Saturday. Matching the platform's own numbering
        -- means no conversion, and no off-by-one to get wrong twice. 127 is
        -- every day. The Monday-first display order lives in the UI, not here.
        weekday_mask   INTEGER NOT NULL DEFAULT 127,
        -- How many times per week or per month a flexible habit must be done.
        target_count   INTEGER NOT NULL DEFAULT 1,
        -- 'HH:MM' in local time, or NULL when the habit has no due time. A
        -- wall-clock string, not an offset: 7am must stay 7am after a flight.
        due_time       TEXT,
        remind_enabled INTEGER NOT NULL DEFAULT 0,
        -- The completion rate this habit is graded against, as a percentage.
        target_pct     INTEGER NOT NULL DEFAULT 80,
        -- 'YYYY-MM-DD'. Statistics never look before this, so a habit added
        -- today is not retroactively "missed" for the rest of the month.
        starts_on      TEXT    NOT NULL,
        -- Set instead of deleting, so archiving a habit keeps its history in
        -- the analytics rather than erasing months of it.
        archived_at    INTEGER,
        created_at     INTEGER NOT NULL,
        updated_at     INTEGER NOT NULL
      )`,
      `CREATE INDEX idx_habits_profile ON habits (profile_id, sort_order)`,

      // A completion is a local calendar day, not an instant. Storing
      // 'YYYY-MM-DD' means crossing a timezone cannot shift yesterday's
      // checkmark onto the day before, and every streak counts days rather
      // than doing millisecond arithmetic that is wrong twice a year.
      `CREATE TABLE completions (
        id       INTEGER PRIMARY KEY AUTOINCREMENT,
        habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        day      TEXT    NOT NULL,
        done_at  INTEGER NOT NULL
      )`,
      // Unique, not merely indexed: "done twice today" is not a state this app
      // has, and the database is the right place to make it impossible.
      `CREATE UNIQUE INDEX idx_completions_habit_day ON completions (habit_id, day)`,
      // The Today screen asks for one day across every habit; without this it
      // scans the whole history to answer.
      `CREATE INDEX idx_completions_day ON completions (day)`,

      // Which OS notifications have been scheduled, so ticking a habit can
      // cancel exactly that day's pending alerts. Device-local bookkeeping: the
      // ids mean nothing on another phone, so this table is never exported.
      `CREATE TABLE scheduled_notifs (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        habit_id        INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
        day             TEXT    NOT NULL,
        notification_id TEXT    NOT NULL,
        fire_at         INTEGER NOT NULL
      )`,
      `CREATE INDEX idx_notifs_habit_day ON scheduled_notifs (habit_id, day)`,

      `CREATE TABLE settings (
        key   TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      )`,

      // Seed a profile in the migration rather than at first launch: the app can
      // then assume a profile always exists, and no screen needs an "if there is
      // no profile yet" branch that would only ever run once.
      `INSERT INTO profiles (id, name, created_at)
       VALUES (1, 'Personal', CAST(strftime('%s','now') AS INTEGER) * 1000)`,
      `INSERT INTO settings (key, value) VALUES ('activeProfileId', '1')`,
    ],
  },
];

/** The schema version a fresh install ends up at. */
export const LATEST_VERSION = migrations.length;
