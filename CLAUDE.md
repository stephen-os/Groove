# Project

Android-first mobile app. **Expo SDK 57** · **React Native 0.86** · **React 19** ·
**TypeScript** · **expo-router**. All data is local to the device — no server, no
accounts, no network.

> The general engineering standards — structure, TypeScript discipline, composition,
> security, tooling, the verify loop — live in the **`app-standards` skill**. Read that
> first. This file covers what is specific to this stack.

```
src/app         routes (expo-router: the file tree IS the navigation)
src/components  ui/ primitives, layout/ providers, pages/ screen-specific
src/lib         theme, db/ (schema + migrations + access), backup, notifications
plugins         Expo config plugins (release signing)
tests           Vitest suites for the pure logic
assets          app icon, splash, adaptive icon
docs            DEVELOPMENT.md (build and run) · RELEASE.md (ship it)
```

`src/hooks` and `src/types` don't exist yet — create each when its first occupant
appears. Import by absolute path (`@/...`).

## Starting a new app from this template

1. `app.json`: set `name`, `slug`, `scheme`, and **`android.package`** — the package
   name is permanent once published, so change it before the first release build.
2. `src/lib/theme.ts`: pick your colours, then `npm test` to check contrast.
3. Replace the `items` domain with the real one — `src/lib/db/schema.ts` migration 1,
   `src/lib/db/items.ts`, the two screens, and the bounds in `src/lib/backup.ts`.
4. Replace `assets/images/` (icon, splash, adaptive icon).

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

- **All SQL is parameterised.** No exceptions, even for an app only you use — a note
  containing an apostrophe is enough to break string-built SQL.
- **Migrations are append-only.** Never edit or reorder one that has run on a device;
  add a corrective migration instead. `npm test` enforces contiguity.
- The **decision** logic (which migrations to run, whether a backup is valid) is pure
  and tested; the SQLite and file-system calls around it are thin wrappers. Keep that
  split — it is what makes any of this testable without a device.

### Security

- There are no secrets, and there should be none. Anything bundled into the app is
  readable by anyone who unzips the APK. The moment real credentials are needed, they
  belong behind a server, not in `app.json` or an `EXPO_PUBLIC_*` variable.
- **The imported backup file is the only untrusted input.** It is parsed with Zod,
  bounded on every field, and never written until it fully validates. Treat any future
  import path the same way.
- **`release.keystore` and `keystore.properties` must never be committed.** Both are
  git-ignored; `npm run secrets` scans the tree. A leaked signing key cannot be revoked
  in any way that helps you.

### Accessibility

The web rules don't translate directly; these are the mobile equivalents.

- Everything tappable is at least **48dp** (`MIN_TOUCH_TARGET`). `Button` enforces it;
  any custom `Pressable` must too.
- **Never set `allowFontScaling={false}`.** Honouring the system font size is the single
  most important accessibility behaviour on a phone.
- **React Native has no `aria-invalid`.** `AccessibilityState` is only
  `disabled`/`selected`/`checked`/`busy`/`expanded`. Field errors are conveyed with
  `accessibilityHint` plus an `accessibilityLiveRegion` announcement — see `TextField`.
- Selected state gets `accessibilityRole="radio"` + `accessibilityState={{ checked }}`,
  never colour alone.
- Labels are wired with `nativeID` + `accessibilityLabelledBy` — the mobile `htmlFor`.
- Test with **TalkBack** on a real device.

### Theming

- All colour lives in `src/lib/theme.ts`. No hex values in components.
- `border` is decorative; **`borderStrong` is for control boundaries** and is the only
  one that meets the 3:1 of WCAG 1.4.11.
- `onAccent` is the text colour *on* the accent fill, and is not the background colour —
  on a light accent it's light, on a dark accent it's dark.
- Contrast is asserted in `tests/lib/theme.test.ts` for **both** themes, including
  against `bgAlt`, which is the tightest pairing and the one an input border uses.

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
