import { z } from 'zod';
import type { Item } from './db/items';

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
const MAX_TITLE = 200;
const MAX_BODY = 10_000;
const MAX_ITEMS = 50_000;

// Epoch milliseconds. Non-negative and finite; `z.number()` alone would accept
// NaN and Infinity, which SQLite would store as NULL or reject.
const timestamp = z.number().int().nonnegative();

const ItemSchema = z.strictObject({
  id: z.number().int().positive(),
  title: z.string().max(MAX_TITLE),
  body: z.string().max(MAX_BODY),
  createdAt: timestamp,
  updatedAt: timestamp,
  remindAt: timestamp.nullable(),
  notificationId: z.string().max(200).nullable(),
});

const BackupSchema = z.strictObject({
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  exportedAt: timestamp,
  items: z.array(ItemSchema).max(MAX_ITEMS),
});

type Backup = z.infer<typeof BackupSchema>;

/** Serialises items into the backup file's exact on-disk shape. */
export function serializeBackup(items: readonly Item[], now: number = Date.now()): string {
  const backup: Backup = {
    formatVersion: BACKUP_FORMAT_VERSION,
    exportedAt: now,
    items: items.map((item) => ({
      id: item.id,
      title: item.title,
      body: item.body,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      remindAt: item.remindAt,
      notificationId: item.notificationId,
    })),
  };
  // Indented: a backup you can open and read is a backup you can salvage by
  // hand when something has gone badly wrong.
  return JSON.stringify(backup, null, 2);
}

export type ParseResult =
  | { ok: true; backup: Backup }
  | { ok: false; error: string };

/**
 * Parses and validates backup file contents.
 *
 * Returns a result rather than throwing: every failure here is a user-facing
 * "that file isn't a valid backup", not a programmer error, and the caller has
 * to show a message either way.
 *
 * The message is deliberately generic about *why* — the specific Zod issue is
 * useful to a developer but noise to a user staring at a settings screen.
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
    const wrongVersion = parsed.error.issues.some((issue) =>
      issue.path.length === 1 && issue.path[0] === 'formatVersion'
    );
    return {
      ok: false,
      error: wrongVersion
        ? `That backup was written by a different app version (this build reads format ${BACKUP_FORMAT_VERSION}).`
        : 'That file is not a valid backup.',
    };
  }

  return { ok: true, backup: parsed.data };
}

/** Timestamped filename, safe on every filesystem — no colons, no spaces. */
export function backupFilename(now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return `backup-${stamp}.json`;
}
