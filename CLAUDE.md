# Groove

A local-only habit tracker for one phone. **Expo SDK 57** · **React Native 0.86** ·
**React 19** · **TypeScript** · **expo-router**. All data is local to the device —
no server, no accounts, no network.

> The general engineering standards — structure, TypeScript discipline, composition,
> security, tooling, the verify loop — live in the **`app-standards` skill**. Read that
> first. This file covers what is specific to this app.

```
src/app         routes (expo-router: the file tree IS the navigation)
                (tabs)/ Today · History · Analytics · Settings
src/components  ui/ primitives, pages/ screen-specific
src/lib         theme, date, schedule, stats, reminder-plan, transfer (all pure)
                db/ (schema + access), backup, backup-file, notifications, reminders
plugins         Expo config plugins (release signing)
tests           Vitest suites for the pure logic
assets          app icon, splash, adaptive icon
docs            DEVELOPMENT.md (build and run) · RELEASE.md (ship it)
```

`src/types` doesn't exist yet — create it when its first occupant appears.
Import by absolute path (`@/...`).

### Where the logic lives

Five pure modules carry the whole app, and each has a test suite:

- **`date.ts`** — day keys. A habit day is a local calendar day, never a timestamp.
- **`schedule.ts`** — `habitsDueOn` decides what is due on a given day. Today, the
  history editor, the analytics denominators and the notification planner all call it.
- **`stats.ts`** — completion rates, streaks and grades, measured against *scheduled*
  opportunities rather than calendar days.
- **`reminder-plan.ts`** — `planAlerts` decides which notifications should exist.
- **`transfer.ts`** — moving habits between phones. `scopeToProfile` and
  `stripHistory` decide what a file contains; `planImport` turns one back into rows.

Everything touching SQLite or the notification service is a thin wrapper around these.
Adding logic to a screen instead of to one of these is how it stops being testable.

## This app is not shipping

It is in development and will only ever be installed on one phone. Three consequences,
and they override the usual instincts:

- **The schema is authoritative, not versioned.** `src/lib/db/schema.ts` says what the
  database *is*. There is no migration list, because there are no older versions in the
  world. Change a column and `client.ts` rebuilds the database from scratch on the next
  launch — the fingerprint in `user_version` is a content hash, not a version number.
  Export a backup first if the data in it matters.
- **Dead code goes.** If something is not used and will not be used, delete it rather
  than leaving it for later. `npm run deadcode` enforces this for exports; the same rule
  applies to anything it cannot see.
- **Git is a task log.** Commits mark verified checkpoints. There is no release history
  to protect.

## Rules specific to this stack

### Native vs JavaScript

- **`npx expo install`, never `npm install`,** for anything with native code. It picks
  the version matched to the SDK; `npm install` picks the newest and produces a build
  that compiles and then crashes on the device.
- **Changing `app.json` or `plugins/` means rebuilding** (`npm run android`). A JS
  reload cannot pick up native config, and the symptom is a change that simply doesn't
  appear.
- `android/` is **generated** by `expo prebuild` and git-ignored. Never edit it directly
  — the next prebuild erases it. Native changes belong in `app.json` or a config plugin.
- Run `npm run doctor` after any dependency change. It catches SDK version mismatches
  and missing native peer dependencies, which otherwise surface as a runtime crash.

### Deprecated APIs in SDK 57

The versions moved recently and several of the obvious imports are the wrong ones:

- `Tabs` from `expo-router` is **deprecated** — import from `expo-router/js-tabs`.
  `expo-router/unstable-native-tabs` is exactly as unstable as it says.
- `File.pickFileAsync(initialUri, mimeType)` positionally is **deprecated** — pass an
  options object: `File.pickFileAsync({ mimeTypes: 'application/json' })`.
- `shouldShowAlert` in a notification handler is **deprecated** — use `shouldShowBanner`
  and `shouldShowList`.
- `expo-file-system` is the `File`/`Directory`/`Paths` API. The old
  `writeAsStringAsync` style is now `expo-file-system/legacy`.

Check the installed `.d.ts` before using an API you remember rather than one you've
just read. Several of these look correct and fail at runtime.

### Data

- **All SQL is parameterised.** No exceptions, even for an app only you use — a habit
  name containing an apostrophe is enough to break string-built SQL.
- **A habit day is a local calendar day**, stored as `'YYYY-MM-DD'`, never a timestamp.
  `src/lib/date.ts` owns that conversion; `toISOString()` is the wrong answer and looks
  like the right one.
- **The weekday bitmask is indexed by `Date.getDay()`** — bit 0 is Sunday. Monday-first
  is a display concern and lives in `WEEKDAYS`, not in storage.
- **Habits archive, they don't delete.** `archived_at` keeps their history in the
  statistics.
- **`ON DELETE CASCADE` does not fire inside `withExclusiveTransactionAsync`.**
  expo-sqlite runs those on a second connection it opens itself and never sets
  `foreign_keys` on, and SQLite defaults that pragma OFF per connection — so
  `client.ts`'s `PRAGMA foreign_keys = ON` covers the shared connection only, and the
  pragma cannot be moved because SQLite ignores it inside a transaction. Delete children
  explicitly, deepest first. This cost a restore-from-backup that aborted on
  `UNIQUE habits.id` and a "delete profile" that orphaned habits into every future
  export; `tests/lib/db/cascade.test.ts` pins all of it.
- **Import adds, restore replaces, and the difference is structural.** `importProfiles`
  only ever *creates* profiles, so there is no existing profile for it to merge into and
  nothing it can overwrite; `replaceData` wipes the database and is reachable only from
  "Start over". Keep that split — a merging import has no sane answer for two histories
  with device-local ids.
- **Profile names are unique, case-insensitively**, enforced by
  `idx_profiles_name` and mirrored by `parseBackup` (a file describing two profiles with
  one name is refused). Import asks for a replacement rather than inventing one —
  auto-suffixing produced "Personal" directly above "Personal (imported)", which is the
  confusion the rule exists to prevent. `isNameTaken` is the one comparison; use it
  everywhere rather than a `Set` lookup, so case and stray space keep matching.
- **A file's ids belong to the phone that wrote it.** `planImport` drops them and nests
  the rows instead, so nothing downstream has to renumber anything. Do not reintroduce a
  flat plan keyed by id.
- **A habits-only export moves `startsOn` to today.** Carrying the original start date
  onto a phone with no history would score the new owner as having missed every day
  since. `stripHistory` owns that, and a test pins it.
- The **pure decisions** — which habits are due on a day, whether a backup is valid,
  what a completion rate is — are separated from the SQLite and file-system calls
  around them. Keep that split; it is what makes any of this testable without a device.

### Testing the data layer

`tests/support/expo-sqlite.ts` aliases `expo-sqlite` to Node's built-in SQLite, so
`src/lib/db` runs its real SQL under `npm test`. Two things about it matter:

- It opens a **second connection** for `withExclusiveTransactionAsync` and creates every
  connection with `enableForeignKeyConstraints: false`, because Node turns foreign keys
  on where SQLite leaves them off. Weaken either and the harness starts passing against
  code that is broken on a device — the first draft did exactly that.
- Tests get a fresh database via `vi.resetModules()` plus a dynamic import, because
  `client.ts` memoises its connection at module scope.

Anything that deletes rows, or relies on a constraint, belongs in a test here rather
than in a hope.

### Security

- There are no secrets, and there should be none. Anything bundled into the app is
  readable by anyone who unzips the APK.
- **The imported backup file is the only untrusted input.** It is parsed with Zod,
  bounded on every field, checked for referential integrity, and never written until it
  fully validates. Treat any future import path the same way.
- **`release.keystore` and `keystore.properties` must never be committed.** Both are
  git-ignored; `npm run secrets` scans the tree.

### Accessibility

The web rules don't translate directly; these are the mobile equivalents.

- Everything tappable is at least **48dp** (`MIN_TOUCH_TARGET`). `Button` enforces it;
  any custom `Pressable` must too.
- **Never set `allowFontScaling={false}`.** Honouring the system font size is the single
  most important accessibility behaviour on a phone.
- **React Native has no `aria-invalid`.** `AccessibilityState` is only
  `disabled`/`selected`/`checked`/`busy`/`expanded`. Field errors are conveyed with
  `accessibilityHint` plus an `accessibilityLiveRegion` announcement — see `TextField`.
- Selected state gets a role plus `accessibilityState={{ checked }}`, never colour alone.
- Labels are wired with `nativeID` + `accessibilityLabelledBy` — the mobile `htmlFor`.
- Test with **TalkBack** on a real device.

### Theming

- The app is **dark only**. There is no light palette, so `colors` is a plain object
  imported directly and styles go straight into `StyleSheet.create`.
- **The accent is the one exception, and it changes at runtime.** It is chosen in
  Settings and stored in `settings`, so it cannot be baked into a stylesheet at import
  time. `ACCENTS` in `theme.ts` holds every option; `useAccent()` returns the one in
  force, and a component layers it over its static style. Anything drawn in the accent —
  a fill, a rim, a gradient, an icon — reads the hook. `colors.accent` does not exist;
  if you find yourself wanting it, you want `useAccent()`.
- A **habit's tint is not the accent** and must not follow it. `HABIT_COLORS` owns its
  own palette, and a test asserts the two sets never overlap.
- All colour lives in `src/lib/theme.ts`. No hex values in components.
- `border` is decorative; **`borderStrong` is for control boundaries** and is the only
  one that meets the 3:1 of WCAG 1.4.11.
- `onAccent` is the text colour *on* the accent fill — on a light accent it's dark.
- Contrast is asserted in `tests/lib/theme.test.ts`, including against `bgAlt`, which is
  the tightest pairing and the one an input border uses. **Every accent is asserted
  too** — against the page at all three tones and against the label drawn on it — so a
  new one that fails cannot ship. That is what makes offering a picker safe.
- Superseded palettes are recorded in `docs/PALETTE-ARCHIVE.md`.

## Verify

```
npm run verify      # test -> typecheck -> lint -> deadcode -> secrets
npm run doctor      # expo-doctor
```

`npm run deadcode` and `npm run secrets` are named that way because scripts called
`knip` and `secretlint` shadow the binaries in `node_modules/.bin`, which `expo-doctor`
flags.

**What the verify loop cannot tell you:** it never compiles the Android app. A green
`verify` plus a green `doctor` means the JavaScript is sound and the config is valid —
it does not mean the app builds or runs. Only `npm run android` proves that.
