import type { DayKey } from './date';
import type { Completion } from './db/completions';
import type { GrooveData } from './db/data';
import type { Habit } from './db/habits';

// Moving habits between phones.
//
// Two directions, and they are deliberately lopsided. Export does the thinking:
// it decides what a file contains and rewrites anything that would be a lie on
// another device. Import does as little as possible — it writes what the file
// says. Putting the transforms on the writing side means a file is honest on
// its own terms, and the untrusted side of the boundary stays dumb.
//
// Pure, and tested in Node. The database wrapper around it is a walk over the
// plan these functions produce.

/** One profile's slice of the database — the unit that moves between phones. */
export function scopeToProfile(data: GrooveData, profileId: number): GrooveData {
  const profiles = data.profiles.filter((profile) => profile.id === profileId);
  const habits = data.habits.filter((habit) => habit.profileId === profileId);
  const habitIds = new Set(habits.map((habit) => habit.id));
  const completions = data.completions.filter((entry) => habitIds.has(entry.habitId));
  return { profiles, habits, completions };
}

/**
 * The same habits with their history taken off — the "just my setup" export.
 *
 * Three transforms, and the second is the one that matters:
 *
 * - Completions go, which is the point.
 * - **`startsOn` moves to today.** A habit remembers the date it began, and the
 *   statistics measure against every scheduled day since. Carrying a 2024 start
 *   date onto a phone with no history to go with it would score the new owner as
 *   having missed eighteen months before they began — the file would arrive
 *   pre-loaded with failure.
 * - Archived habits are dropped. They exist to keep a name attached to old
 *   completions, and there are none here; importing one would land a retired
 *   habit that has never been done.
 */
export function stripHistory(data: GrooveData, today: DayKey): GrooveData {
  const habits = data.habits
    .filter((habit) => habit.archivedAt === null)
    .map((habit) => ({ ...habit, startsOn: today }));
  return { profiles: data.profiles, habits, completions: [] };
}

// The plan an import executes.
//
// Nested rather than three flat lists keyed by id, and that is the whole design.
// Ids in a file are the exporting phone's, and cannot survive next to rows that
// already exist here — so a flat plan would have to be renumbered, which means a
// map from old id to new, which means every reference is one lookup away from
// pointing at the wrong habit. Nesting deletes the problem: there is nothing to
// renumber because there are no ids left to get wrong.

type ImportHabit = Omit<Habit, 'id' | 'profileId'> & {
  readonly completions: readonly ImportCompletion[];
};
type ImportCompletion = Omit<Completion, 'id' | 'habitId'>;

export interface ImportProfile {
  readonly name: string;
  readonly createdAt: number;
  readonly habits: readonly ImportHabit[];
}

/**
 * Turns a validated file into rows to insert, with every id dropped.
 *
 * `names` renames profiles on the way in, keyed by the id they have *in the
 * file*. Profile names are unique, so a file naming a profile this device
 * already has cannot simply be written — and inventing a name for it produced
 * "Personal" sitting directly above "Personal (imported)", which is precisely
 * the confusion the uniqueness rule exists to prevent. The choice belongs to
 * whoever is importing; this is where their answer is applied.
 */
export function planImport(
  data: GrooveData,
  names: ReadonlyMap<number, string> = new Map()
): ImportProfile[] {
  const byHabit = new Map<number, ImportCompletion[]>();
  for (const entry of data.completions) {
    const list = byHabit.get(entry.habitId);
    const stripped = { day: entry.day, status: entry.status, doneAt: entry.doneAt };
    if (list) list.push(stripped);
    else byHabit.set(entry.habitId, [stripped]);
  }

  return data.profiles.map((profile) => ({
    name: names.get(profile.id) ?? profile.name,
    createdAt: profile.createdAt,
    habits: data.habits
      .filter((habit) => habit.profileId === profile.id)
      .map(({ id, profileId: _profileId, ...rest }) => ({
        ...rest,
        completions: byHabit.get(id) ?? [],
      })),
  }));
}

// Profile names are unique, and compared without regard to case or surrounding
// space. A switcher offering "Personal" and "personal" asks you to tell apart
// two things that read identically at a glance, which is the same failure as
// allowing the duplicate outright.

const normalise = (name: string): string => name.trim().toLowerCase();

/** Whether a name is already in use, ignoring case and surrounding space. */
export function isNameTaken(name: string, taken: readonly string[]): boolean {
  const wanted = normalise(name);
  return taken.some((existing) => normalise(existing) === wanted);
}

/**
 * The profiles in a file whose names this device is already using.
 *
 * Returned in the file's own order and paired with the id they carry there, so
 * the caller can ask about each one and hand the answers back to `planImport`.
 */
export function clashingProfiles(
  data: GrooveData,
  taken: readonly string[]
): { id: number; name: string }[] {
  // Grows as it goes, so two profiles in one file that share a name are caught
  // as well — the second is a clash even if this device has neither.
  const used = [...taken];
  const clashes: { id: number; name: string }[] = [];
  for (const profile of data.profiles) {
    if (isNameTaken(profile.name, used)) clashes.push({ id: profile.id, name: profile.name });
    used.push(profile.name);
  }
  return clashes;
}
