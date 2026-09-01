import { describe, expect, it } from 'vitest';
import { first } from '../support/fixtures';
import { schemaFingerprint, SCHEMA } from '@/lib/db/schema';

// The fingerprint is what decides whether the database on disk gets thrown away
// and rebuilt. Two properties matter and nothing else does: the same schema must
// always hash the same (or the app rebuilds on every launch and loses data every
// time), and a changed schema must hash differently (or the database silently
// keeps the old shape and the app fails in confusing ways later).

describe('schemaFingerprint', () => {
  it('is stable across calls', () => {
    expect(schemaFingerprint()).toBe(schemaFingerprint());
  });

  it('fits SQLite signed 32-bit user_version', () => {
    const value = schemaFingerprint();
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(0x7fffffff);
  });

  it('changes when a column is added', () => {
    const changed = SCHEMA.map((statement) =>
      statement.replace('target_pct     INTEGER NOT NULL DEFAULT 80,', 'target_pct INTEGER, note TEXT,')
    );
    expect(schemaFingerprint(changed)).not.toBe(schemaFingerprint());
  });

  it('changes when a statement is removed', () => {
    expect(schemaFingerprint(SCHEMA.slice(0, -1))).not.toBe(schemaFingerprint());
  });

  it('changes when statements are reordered', () => {
    const reordered = [first(SCHEMA.slice(1)), first(SCHEMA), ...SCHEMA.slice(2)];
    expect(schemaFingerprint(reordered)).not.toBe(schemaFingerprint());
  });

  it('is unchanged by a statement that only differs in whitespace it does not have', () => {
    expect(schemaFingerprint([...SCHEMA])).toBe(schemaFingerprint());
  });
});

describe('SCHEMA', () => {
  it('creates every table the app reads from', () => {
    const ddl = SCHEMA.join('\n');
    for (const table of [
      'profiles',
      'habits',
      'completions',
      'scheduled_notifs',
      'settings',
    ]) {
      expect(ddl).toContain(`CREATE TABLE ${table} (`);
    }
  });

  it('seeds a profile and points the active-profile setting at it', () => {
    const ddl = SCHEMA.join('\n');
    expect(ddl).toContain('INSERT INTO profiles');
    expect(ddl).toContain("INSERT INTO settings (key, value) VALUES ('activeProfileId', '1')");
  });

  it('makes a habit completed twice on one day impossible', () => {
    expect(SCHEMA.join('\n')).toContain(
      'CREATE UNIQUE INDEX idx_completions_habit_day ON completions (habit_id, day)'
    );
  });
});
