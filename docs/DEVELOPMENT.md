# Development guide

Getting from a fresh clone to the app running on your own Android phone, on Windows.

> **What `npm run verify` does and does not tell you.** It runs the tests, types, lint,
> dead-code and secret checks, and never compiles the Android app. Green means the
> JavaScript is sound and the config is valid; only `npm run android` proves the thing
> builds and runs. Changing `app.json` or anything in `plugins/` needs a prebuild, and
> the symptom of skipping one is a change that simply doesn't appear.

---

## 1. Prerequisites

| Tool | Why | Check |
| --- | --- | --- |
| **Node 22+** | Metro bundler, tooling | `node -v` |
| **JDK 17** | Gradle needs it; 21 also works, 17 is what RN targets | `java -version` |
| **Android SDK** | The actual compiler, emulator and `adb` | `adb version` |

Node and JDK are the easy ones. The Android SDK is the part that takes a while.

### Installing the Android SDK

Two options. **Android Studio** is the path of least resistance even if you never open
the IDE — it installs the SDK, the platform tools and the emulator together, and keeps
them updated.

1. Install Android Studio.
2. First launch → **More Actions → SDK Manager**.
3. On **SDK Platforms**, tick the latest Android version.
4. On **SDK Tools**, make sure these are ticked:
   - Android SDK Build-Tools
   - Android SDK Platform-Tools
   - Android SDK Command-line Tools
   - Android Emulator (only if you want an emulator as well as a real phone)
5. Note the **SDK Location** shown at the top. It is normally:
   `C:\Users\<you>\AppData\Local\Android\Sdk`

### Environment variables

Gradle finds the SDK through `ANDROID_HOME`, and you want `adb` on your `PATH`.
In PowerShell, once, permanently:

```powershell
[Environment]::SetEnvironmentVariable('ANDROID_HOME', "$env:LOCALAPPDATA\Android\Sdk", 'User')
[Environment]::SetEnvironmentVariable(
  'Path',
  [Environment]::GetEnvironmentVariable('Path','User') + ";$env:LOCALAPPDATA\Android\Sdk\platform-tools",
  'User'
)
```

**Open a new terminal** — environment changes don't apply to already-running shells.
Then confirm:

```powershell
$env:ANDROID_HOME
adb version
```

If `adb` still isn't found, the SDK location is different from the default; use the path
the SDK Manager showed you.

`JAVA_HOME` is usually unnecessary — Gradle finds a JDK on `PATH`. Set it the same way
if Gradle complains it can't find one.

---

## 2. Prepare your phone

1. **Settings → About phone** → tap **Build number** seven times. This unlocks
   Developer options.
2. **Settings → System → Developer options** → enable **USB debugging**.
3. Plug the phone in with a cable that carries data (many charge-only cables do not —
   this is a genuinely common time sink).
4. Accept the "Allow USB debugging?" prompt on the phone. Tick "always allow".
5. Confirm the computer can see it:

```powershell
adb devices
```

You want a line ending in `device`. If it says `unauthorized`, re-accept the prompt on
the phone. If the list is empty, try another cable or USB port first.

### Wireless, once it's working

Cables are fiddly. Android 11+ supports wireless debugging: enable it under Developer
options, choose **Pair device with pairing code**, then:

```powershell
adb pair <ip>:<pairing-port>     # the pairing screen shows both
adb connect <ip>:<debug-port>    # the main wireless-debugging screen shows this one
```

The phone and PC must be on the same network.

---

## 3. First run

```powershell
npm install
npm run android
```

That does a lot on first invocation:

1. `expo prebuild` generates the native `android/` project from `app.json`.
2. Gradle downloads its dependencies and compiles. **Expect 5–15 minutes the first
   time**, and a lot of output. Subsequent builds are far quicker.
3. The resulting development build is installed on your phone.
4. The Metro bundler starts and the app connects to it.

If Gradle fails, the error is almost always one of: `ANDROID_HOME` not set, no JDK, or
no licence accepted. For the last one:

```powershell
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" --licenses
```

### Why not Expo Go?

Expo Go is the pre-built sandbox app; it can't contain this project's native modules
(`expo-sqlite`, `expo-notifications`), so the app would fail on the first database call.
`npm run android` builds a **development build** — your own app, with your own native
modules, plus the dev-tooling that makes fast refresh work. It is the right default and
the reason `npm start` passes `--dev-client`.

---

## 4. The daily loop

Once the development build is installed, you rarely rebuild it:

```powershell
npm start
```

Metro starts; the app on your phone connects. Save a file and it reloads in about a
second. Shake the phone (or `adb shell input keyevent 82`) for the dev menu.

**You only need `npm run android` again when the native layer changes**, meaning:

- you add or remove a native dependency (anything with a config plugin, or any
  `expo install` of a module with native code)
- you change `app.json` — app name, icon, permissions, plugins
- you change anything in `plugins/`

Pure JavaScript, TypeScript and styling changes never need a rebuild.

---

## 5. Working in the codebase

Run the checks before considering anything done:

```powershell
npm run verify      # test -> typecheck -> lint -> deadcode -> secrets
npm run doctor      # expo-doctor: config, versions, peer deps
```

### Adding a screen

Routes are files under `src/app/`, via expo-router.

- A tab: add `src/app/(tabs)/thing.tsx`, then a `<Tabs.Screen name="thing">` entry in
  `src/app/(tabs)/_layout.tsx`.
- A pushed screen: add `src/app/thing/detail.tsx` and navigate with
  `router.push('/thing/detail')`. Register it in `src/app/_layout.tsx` if it needs
  specific options such as `presentation: 'modal'`.

Typed routes are on, so `router.push` autocompletes and a typo is a type error.

### Changing the database

`src/lib/db/schema.ts` is the authority on the shape of the data. There is no migration
list and nothing to append to — edit the `CREATE TABLE` directly:

```ts
`CREATE TABLE habits (
   ...
   colour TEXT NOT NULL DEFAULT '',
 )`,
```

On the next launch the fingerprint in `user_version` no longer matches, so `client.ts`
deletes the database and rebuilds it from `SCHEMA`. **Everything on the phone is
erased** — but not lost: `writeRescue` runs first and saves the whole contents to
`Paths.document/rescue/`, which the Settings screen then offers to share and *Restore
from backup* takes back. Export a backup as well if the data really matters; a rescue
file is a safety net, not a plan.

Two things follow from that. Native config changes (`app.json`, `plugins/`) need
`npx expo prebuild --platform android --clean` — a plain prebuild leaves existing
native resources alone, so a changed splash or icon colour silently does not appear.
And the demo profile disappears with the rest, which is why the button that adds it
checks for the profile by name rather than remembering a flag.

Then update the `Habit` interface and row mapping in `src/lib/db/habits.ts`, and — if the
field should survive a backup — the schema and bounds in `src/lib/backup.ts`.

This trade only holds because Groove has never shipped. If it ever does, a real migration
path has to arrive before the first release, not after.

### Changing the theme

All colour is in `src/lib/theme.ts`. The app is dark only — there is no light palette and
no runtime switch. `npm test` measures every foreground/background pair against WCAG AA
and fails on a regression, so change a colour, run the tests, and let them tell you
whether it is legible.

---

## 6. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| `adb devices` is empty | Charge-only cable, or USB debugging off. Try another cable first. |
| `SDK location not found` | `ANDROID_HOME` unset, or set in a shell opened before you set it. Open a new terminal. |
| Gradle fails on licences | Run `sdkmanager.bat --licenses` and accept. |
| App opens then immediately closes | Usually a native module missing from the build. Re-run `npm run android`, not `npm start`. |
| Metro serves stale code | `npm start -- --clear`. |
| Changes don't appear at all | You edited native config; JS reload can't pick that up. Rebuild. |
| Red screen citing a missing module | You `npm install`ed a native package instead of `npx expo install`ing it, or didn't rebuild after. |
| `expo-doctor` complains about versions | `npx expo install --fix` aligns packages to the SDK. |
