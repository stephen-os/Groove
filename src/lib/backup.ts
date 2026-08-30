import { z } from 'zod';
import type { GrooveData } from './db/data';

// Backup serialisation and parsing. Pure — no file system, no database — so the
// validation logic is exhaustively testable in plain Node.
//
// This is the app's only untrusted input. Everything else in a local-only app
// comes from the app itself, but a backup file is arbitrary bytes the user
// picked: it may be from a newer version, hand-edited, truncated by a failed
// share, or simply the wrong file. It gets parsed, never cast.

/**
 * Bumped only when the on-disk shape changes incompatibly.
 *
 * Refusing an unknown version is deliberate. Importing a format we don't
 * understand would either drop fields silently or write malformed rows, and a
 * backup restore is exactly the moment a user cannot afford either.
 */
export const BACKUP_FORMAT_VERSION = 1;

// Bounds on every field. An unbounded string or array from a file the app will
// happily read into memory is how a 2GB "backup" becomes a crash on launch.
const MAX_NAME = 200;
const MAX_PROFILES = 100;
const MAX_HABITS = 2_000;
// Ten years of thirty habits ticked every day, with room to spare.
const MAX_COMPLETIONS = 200_000;

// Epoch milliseconds. Non-negative and finite; `z.number()` alone would accept
// NaN and Infinity, which SQLite would store as NULL or reject.
const timestamp = z.number().int().nonnegative();
const id = z.number().int().positive();
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD day.');

const ProfileSchema = z.strictObject({
  id,
  name: z.string().max(MAX_NAME),
  createdAt: timestamp,
});

const HabitSchema = z.strictObject({
  id,
  profileId: id,
  name: z.string().max(MAX_NAME),
  icon: z.string().max(32),
  color: z.string().max(32),
  sortOrder: z.number().int(),
  scheduleKind: z.enum(['daily', 'weekly', 'monthly']),
  // Seven bits, so anything outside 0–127 is not a week.
  weekdayMask: z.number().int().min(0).max(127),
  targetCount: z.number().int().min(1).max(366),
  dueTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected a HH:MM time.')
    .nullable(),
  remindEnabled: z.boolean(),
  targetPct: z.number().int().min(0).max(100),
  startsOn: dayKey,
  archivedAt: timestamp.nullable(),
  createdAt: timestamp,
  updatedAt: timestamp,
});

const CompletionSchema = z.strictObject({
  id,
  habitId: id,
  day: dayKey,
  doneAt: timestamp,
});

const BackupSchema = z.strictObject({
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  exportedAt: timestamp,
  profiles: z.array(ProfileSchema).max(MAX_PROFILES),
  habits: z.array(HabitSchema).max(MAX_HABITS),
  completions: z.array(CompletionSchema).max(MAX_COMPLETIONS),
});

type Backup = z.infer<typeof BackupSchema>;

/** Serialises the database into the backup file's exact on-disk shape. */
export function serializeBackup(data: GrooveData, now: number = Date.now()): string {
  const backup: Backup = {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: now,
    profiles: data.profiles.map((profile) => ({ ...profile })),
    habits: data.habits.map((habit) => ({ ...habit })),
    completions: data.completions.map((completion) => ({ ...completion })),
  };
  // Indented: a backup you can open and read is a backup you can salvage by
  // hand when something has gone badly wrong.
  return JSON.stringify(backup, null, 2);
}

/**
 * Checks the file is internally consistent, beyond each row being well-formed.
 *
 * Zod validates rows in isolation; these are the rules that only exist between
 * them, and they are exactly the ones the database enforces. Without this check
 * a habit pointing at a missing profile would pass validation and then blow up
 * mid-restore on a foreign key, which is far harder to explain to the person
 * holding the phone than "that file isn't a valid backup".
 */
function referentialError(backup: Backup): string | null {
  const profileIds = new Set(backup.profiles.map((profile) => profile.id));
  const habitIds = new Set(backup.habits.map((habit) => habit.id));

  if (profileIds.size !== backup.profiles.length) return 'That backup has duplicate profiles.';
  if (habitIds.size !== backup.habits.length) return 'That backup has duplicate habits.';

  const orphanHabit = backup.habits.find((habit) => !profileIds.has(habit.profileId));
  if (orphanHabit) {
    return `That backup has a habit ("${orphanHabit.name}") belonging to a profile it does not contain.`;
  }

  const orphanCompletion = backup.completions.find(
    (completion) => !habitIds.has(completion.habitId)
  );
  if (orphanCompletion) {
    return 'That backup records a completed day for a habit it does not contain.';
  }

  // Mirrors the unique index on (habit_id, day) — a duplicate would abort the
  // restore transaction after most of the data had already been written.
  const seen = new Set<string>();
  for (const completion of backup.completions) {
    const key = `${completion.habitId}:${completion.day}`;
    if (seen.has(key)) return 'That backup marks the same habit complete twice on one day.';
    seen.add(key);
  }

  return null;
}

export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: string };

/**
 * Parses and validates backup file contents.
 *
 * Returns a result rather than throwing: every failure here is a user-facing
 * "that file isn't a valid backup", not a programmer error, and the caller has
 * to show a message either way.
 */
export function parseBackup(text: string): ParseResult {
  const json: unknown = (() => {
    try {
      return JSON.parse(text);
    } catch {
      // JSON has no `undefined` literal, so it is a safe sentinel for a parse
      // failure — no valid document can produce it.
      return undefined;
    }
  })();

  if (json === undefined) {
    return { ok: false, error: 'That file is not valid JSON.' };
  }

  const parsed = BackupSchema.safeParse(json);
  if (!parsed.success) {
    // Distinguish the one failure a user can act on: a file from a version this
    // build doesn't understand. Everything else is "wrong file".
    const wrongVersion = parsed.error.issues.some(
      (issue) => issue.path.length === 1 && issue.path[0] === 'formatVersion'
    );
    return {
      ok: false,
      error: wrongVersion
        ? `That backup was written by a different app version (this build reads format ${BACKUP_FORMAT_VERSION}).`
        : 'That file is not a valid backup.',
    };
  }

  const inconsistent = referentialError(parsed.data);
  if (inconsistent !== null) return { ok: false, error: inconsistent };

  return { ok: true, backup: parsed.data };
}

/** Timestamped filename, safe on every filesystem — no colons, no spaces. */
export function backupFilename(now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `groove-${stamp}.json`;
}
