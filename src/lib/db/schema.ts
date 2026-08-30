// The database schema. This file is the authority on the shape of the data.
//
// There is no migration list and no version history, because there are no older
// versions of Groove in the world — it has never shipped. What is written here is
// simply what the database looks like. Change a column and the app rebuilds the
// database to match on the next launch (see `client.ts`), which is the right
// trade during development: a schema that has silently diverged from the code is
// far more expensive than a habit list that has to be re-entered.
//
// Export a backup before changing this file if the data in it matters.

export const SCHEMA: readonly string[] = [
  // Profiles are the app's answer to "personal habits vs work habits" without an
  // account system: separate habit lists in one database, one active at a time.
  // Deleting a profile takes its habits and their history with it, which is why
  // every child table cascades.
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
    -- 'daily' | 'weekly' | 'monthly'. Daily reads weekday_mask; weekly and
    -- monthly read target_count and ignore the mask entirely.
    schedule_kind  TEXT    NOT NULL,
    -- Bitmask indexed by JavaScript's Date.getDay(): bit 0 is Sunday through
    -- bit 6 is Saturday. Matching the platform's own numbering means no
    -- conversion, and no off-by-one to get wrong twice. 127 is every day. The
    -- Monday-first display order lives in the UI, not here.
    weekday_mask   INTEGER NOT NULL DEFAULT 127,
    -- How many times per week or per month a flexible habit must be done.
    target_count   INTEGER NOT NULL DEFAULT 1,
    -- 'HH:MM' in local time, or NULL when the habit has no due time. A
    -- wall-clock string, not an offset: 7am must stay 7am after a flight.
    due_time       TEXT,
    remind_enabled INTEGER NOT NULL DEFAULT 0,
    -- How many follow-up nags after the due-time alert, 0 to 3. Zero means one
    -- notification and no chasing, which is the right setting for a habit you
    -- want a nudge about but not a pestering.
    follow_ups     INTEGER NOT NULL DEFAULT 3,
    -- The completion rate this habit is graded against, as a percentage.
    target_pct     INTEGER NOT NULL DEFAULT 80,
    -- 'YYYY-MM-DD'. Statistics never look before this, so a habit added today
    -- is not retroactively "missed" for the rest of the month.
    starts_on      TEXT    NOT NULL,
    -- Set instead of deleting, so archiving a habit keeps its history in the
    -- analytics rather than erasing months of it.
    archived_at    INTEGER,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL
  )`,
  `CREATE INDEX idx_habits_profile ON habits (profile_id)`,

  // A completion is a local calendar day, not an instant. Storing 'YYYY-MM-DD'
  // means crossing a timezone cannot shift yesterday's checkmark onto the day
  // before, and every streak counts days rather than doing millisecond
  // arithmetic that is wrong twice a year.
  `CREATE TABLE completions (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
    day      TEXT    NOT NULL,
    -- 'done' or 'skipped'. Skipping is opting out of that one opportunity: it
    -- silences the reminder and is removed from the denominator, so a day you
    -- were ill or away does not read as a failure. The absence of a row is the
    -- third state -- not done, and counted against you.
    status   TEXT    NOT NULL DEFAULT 'done',
    done_at  INTEGER NOT NULL
  )`,
  // Unique, not merely indexed: "done twice today" is not a state this app has,
  // and the database is the right place to make it impossible.
  `CREATE UNIQUE INDEX idx_completions_habit_day ON completions (habit_id, day)`,
  // The Today screen asks for one day across every habit; without this it scans
  // the whole history to answer.
  `CREATE INDEX idx_completions_day ON completions (day)`,

  // Which OS notifications have been scheduled, so ticking a habit can cancel
  // exactly that day's pending alerts. Device-local bookkeeping: the ids mean
  // nothing on another phone, so this table is never exported.
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

  // Seed a profile as part of the schema rather than at first launch: the app
  // can then assume a profile always exists, and no screen needs an "if there
  // is no profile yet" branch that would only ever run once.
  `INSERT INTO profiles (id, name, created_at)
   VALUES (1, 'Personal', CAST(strftime('%s','now') AS INTEGER) * 1000)`,
  `INSERT INTO settings (key, value) VALUES ('activeProfileId', '1')`,
];

/**
 * A content hash of the schema above.
 *
 * Not a version number — nothing counts up and nothing is ordered. It answers
 * exactly one question at startup: is the database on disk the shape this build
 * expects? If it isn't, the database is thrown away and rebuilt from `SCHEMA`.
 *
 * Masked to 31 bits so it always fits SQLite's signed 32-bit `user_version`,
 * which is where it gets stored — that pragma survives the tables being dropped,
 * so there is no bootstrapping problem.
 */
export function schemaFingerprint(statements: readonly string[] = SCHEMA): number {
  const source = statements.join(';');
  // djb2. Not cryptographic, and does not need to be: the only thing that could
  // "attack" it is a schema edit, and any realistic edit changes the hash.
  let hash = 5381;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 33 + source.charCodeAt(index)) | 0;
  }
  return hash & 0x7fffffff;
}
