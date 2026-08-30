# expo-mobile

An Android-first mobile starting point: navigation, theming, a real local database with
migrations, backup and restore, and local reminders — with nothing that needs a server.

**Expo SDK 57** · **React Native 0.86** · **React 19** · **TypeScript** ·
**expo-router** · **expo-sqlite** · **Vitest**

Built for the case where the only user is you, with the Play Store as an opt-in
upgrade rather than the assumed destination.

## What's in it

| Area | What you get |
| --- | --- |
| **Navigation** | expo-router, tab layout + a modal stack route, typed routes, a 404 screen |
| **Shell** | Safe-area `Screen`, themed status bar, splash held until the database is ready, and a readable failure screen if it isn't |
| **Primitives** | `Text`, `Button`, `Card`, `TextField` — themed, 48dp targets, screen-reader wiring |
| **Theme** | Light + dark tokens, follows the system or an explicit choice, persisted. Contrast asserted in tests for both themes |
| **Database** | SQLite with append-only migrations, `user_version` tracking, transactional application, and a typed data-access layer |
| **Backup** | Export to JSON via the share sheet; restore from a picked file, validated with Zod before anything is written |
| **Reminders** | Local scheduled notifications, permission handled, cancelled when the item is deleted. No push service |
| **Release signing** | A config plugin that survives `prebuild` regenerating `android/`, with post-condition assertions and tests |
| **Tooling** | ESLint, `tsc`, Vitest, Knip, secretlint, expo-doctor — behind `npm run verify` |

## What it deliberately leaves out

Decisions, not oversights.

- **No backend, no accounts, no auth, no network.** That is the point. Everything is on
  the device.
- **No EAS.** Builds are local. Nothing depends on Expo's cloud or a build queue.
- **No push notifications.** Local scheduled reminders only — no token registration, no
  server, nothing leaves the device.
- **No component test renderer.** Vitest covers the pure logic; rendering React Native
  components needs `jest-expo`, which is a separate toolchain. The data layer is
  deliberately shaped so the logic worth testing doesn't need a device.
- **No date picker.** Reminders use preset offsets, to avoid another native dependency.
- **No state management library.** Screen state plus the database has been enough.
- **iOS is untested.** The code is portable and nothing here is Android-only, but iOS
  needs a Mac or a paid Apple account to actually run, so it has never been built.

## Requirements

Node **22+**, **JDK 17**, and the **Android SDK**. The SDK is the part that takes a
while — [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) walks through it.

## Getting started

```powershell
npm install
npm run android     # first run: generates android/, compiles, installs on your phone
```

Then day to day:

```powershell
npm start           # Metro; the installed dev build connects to it
```

Full walkthrough, including phone setup and troubleshooting:
**[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**.
Shipping it, to your phone or to Play: **[docs/RELEASE.md](docs/RELEASE.md)**.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm start` | Metro bundler for the development build |
| `npm run android` | Prebuild, compile and install on a connected device |
| `npm run prebuild` | Regenerate `android/` only |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run deadcode` | Knip — unused files, exports, dependencies |
| `npm run secrets` | secretlint |
| `npm run doctor` | expo-doctor — SDK versions, config schema, native peer deps |
| **`npm run verify`** | **test → typecheck → lint → deadcode → secrets** |

`deadcode` and `secrets` avoid the names `knip`/`secretlint` because a script sharing a
name with a binary in `node_modules/.bin` is flagged by `expo-doctor`.

## Layout

```
src/app         routes — the file tree is the navigation
  (tabs)/       tab screens: items list, settings
  item/new      modal create screen
src/components  ui/ primitives · layout/ providers · pages/ screen-specific
src/lib         theme · db/ (schema, migrate, client, items, settings) · backup · notifications
plugins         Expo config plugins
tests           Vitest — pure logic only
```

## Data

One SQLite database, opened once and shared. The schema is an append-only list of
migrations in `src/lib/db/schema.ts`, tracked with SQLite's `user_version` and applied
inside transactions, so a crash part-way cannot record a half-applied schema as done.

Ids are autoincrement integers rather than UUIDs — the database never syncs with another
device, so SQLite can own identity and the app needs no id generator and no crypto
dependency.

Restore **replaces** all items rather than merging. With device-local ids there is no
sane reconciliation of two histories, and silently duplicating everything would be worse
than being explicit about overwriting.

## Tests

66 tests, all against pure logic — no device, no emulator.

- **`migrate`** — the version arithmetic the whole schema rests on, including a database
  *newer* than the app (a downgrade, where applying anything would destroy data) and a
  negative `user_version` (where a naive `slice` would silently skip every migration but
  the last).
- **`backup`** — round trips, and the rejection of every malformed input a picked file
  can carry: bad JSON, wrong format version, missing and unknown fields, out-of-bound
  strings, non-integer timestamps.
- **`theme`** — every foreground/background pair in **both** themes against WCAG AA, and
  every control boundary against 1.4.11.
- **`release-signing`** — that the Gradle transformation points *release* at the release
  key and leaves *debug* alone. That bug shipped once during development: it produces a
  build.gradle Gradle accepts and an APK that installs, and only bites much later when
  an update refuses to install over it.

## A note on what's verified

Everything in `npm run verify` and `npm run doctor` was run and is green, along with
`expo prebuild`. The **Gradle build was not run** — the machine this was written on has
no Android SDK. The JavaScript, the config and the native project generation are sound;
the first `npm run android` is what proves the rest.
