import { describe, expect, it } from 'vitest';
import {
  BACKUP_FORMAT_VERSION,
  backupFilename,
  parseBackup,
  serializeBackup,
} from '@/lib/backup';
import type { Item } from '@/lib/db/items';

const item: Item = {
  id: 1,
  title: 'Example',
  body: 'Notes',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  remindAt: null,
  notificationId: null,
};

describe('round trip', () => {
  it('parses back exactly what it serialized', () => {
    const parsed = parseBackup(serializeBackup([item], 1_700_000_001_000));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.items).toEqual([item]);
    expect(parsed.backup.exportedAt).toBe(1_700_000_001_000);
    expect(parsed.backup.formatVersion).toBe(BACKUP_FORMAT_VERSION);
  });

  it('handles an empty database', () => {
    const parsed = parseBackup(serializeBackup([]));
    expect(parsed.ok).toBe(true);
  });

  it('preserves a reminder and its notification id', () => {
    const withReminder: Item = { ...item, remindAt: 1_800_000_000_000, notificationId: 'abc' };
    const parsed = parseBackup(serializeBackup([withReminder]));
    expect(parsed.ok && parsed.backup.items[0]).toEqual(withReminder);
  });
});

describe('parseBackup rejects untrusted input', () => {
  const valid = JSON.parse(serializeBackup([item])) as Record<string, unknown>;
  const withItems = (items: unknown[]): string => JSON.stringify({ ...valid, items });

  it('rejects malformed JSON', () => {
    const result = parseBackup('{not json');
    expect(result).toEqual({ ok: false, error: 'That file is not valid JSON.' });
  });

  it('rejects a JSON document that is not an object', () => {
    expect(parseBackup('[]').ok).toBe(false);
    expect(parseBackup('"hello"').ok).toBe(false);
    expect(parseBackup('null').ok).toBe(false);
  });

  it('names the version mismatch specifically, since that is the one a user can act on', () => {
    const result = parseBackup(JSON.stringify({ ...valid, formatVersion: 99 }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/different app version/);
  });

  it('rejects an item missing a required field', () => {
    expect(parseBackup(withItems([{ id: 1, title: 'x' }])).ok).toBe(false);
  });

  it('rejects unknown extra fields rather than silently dropping them', () => {
    // strictObject. A file with fields we don't understand is more likely a
    // newer format than a valid one, and importing it would lose data.
    expect(parseBackup(withItems([{ ...item, surprise: true }])).ok).toBe(false);
  });

  it('rejects a title beyond the length bound', () => {
    expect(parseBackup(withItems([{ ...item, title: 'x'.repeat(201) }])).ok).toBe(false);
  });

  it('rejects NaN and Infinity timestamps', () => {
    // These survive a hand-edit and JSON round trips as null, but a raw object
    // could carry them; z.number() alone would accept both.
    expect(parseBackup(withItems([{ ...item, createdAt: null }])).ok).toBe(false);
    expect(parseBackup(withItems([{ ...item, createdAt: -1 }])).ok).toBe(false);
    expect(parseBackup(withItems([{ ...item, createdAt: 1.5 }])).ok).toBe(false);
  });

  it('rejects a non-positive id, which SQLite would treat as "assign me one"', () => {
    expect(parseBackup(withItems([{ ...item, id: 0 }])).ok).toBe(false);
  });
});

describe('backupFilename', () => {
  it('contains no characters that are illegal in a filename', () => {
    // Colons from an ISO timestamp are invalid on Windows and awkward on
    // Android's SAF; this is why the timestamp is rewritten rather than sliced.
    const name = backupFilename(new Date('2026-03-05T14:30:15.000Z'));
    expect(name).toBe('backup-2026-03-05-14-30-15.json');
    expect(name).not.toMatch(/[:\s/\\]/);
  });
});
