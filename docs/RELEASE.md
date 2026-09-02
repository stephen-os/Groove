# Running it for real

Two destinations, and they are very different amounts of work.

| | **Just my phone** | **Google Play** |
| --- | --- | --- |
| Cost | £0 | $25 one-off developer account |
| Review | none | days, per release |
| Identity | none | legal name/address, publicly visible for personal accounts |
| Testing requirement | none | personal accounts must run closed testing before production |
| Privacy policy, data-safety form | not needed | required |
| Time to first install | one build | weeks, realistically |
| Updates | rebuild, reinstall | new version code, upload, wait for review |

**If only you will ever use this app, take the first path.** Nothing about it is
second-class — it produces the same optimised release build. The Play Store buys you
distribution to strangers, and that is the only thing it buys you.

---

## Part 1 — A signed release APK for your own phone

### 1. Create a signing key, once

The key identifies the app. Android will only install an update if it is signed with the
**same** key, so this file matters more than the code: lose it and you cannot update
your own app without uninstalling it (and losing its local data) first.

`keytool` ships with the JDK — but note that Oracle's installer only puts `java`,
`javac`, `javaw` and `jshell` on the `PATH`, so `keytool` is usually **not** callable by
name even with a working JDK. Use the full path, or add the JDK's `bin` to your `PATH`:

```powershell
& "$env:ProgramFiles\Java\jdk-17\bin\keytool.exe" -genkeypair -v -storetype PKCS12 `
  -keystore release.keystore `
  -alias release `
  -keyalg RSA -keysize 2048 -validity 10000
```

(Adjust the JDK folder to match what you have; `java -version` tells you the version.)

It asks for a password and some identity fields. For a personal app the identity fields
can be anything; **the password cannot be lost**.

Put `release.keystore` in the project root. It is git-ignored — verify with
`git check-ignore release.keystore`, which should echo the filename back.

### 2. Point the build at it

Create `keystore.properties` in the project root:

```properties
storeFile=../release.keystore
storePassword=<the password you chose>
keyAlias=release
keyPassword=<usually the same password>
```

Also git-ignored. The path is relative to the generated `android/` directory, which is
why it starts with `../`.

`plugins/with-release-signing.js` wires this into the Gradle build during `prebuild`.
It exists because `android/` is regenerated and git-ignored — a signing config edited
into `build.gradle` by hand is erased on the next prebuild, and the build then silently
falls back to the **debug** key. That produces an APK that installs fine and then can
never be updated. The plugin asserts its own output and is covered by tests.

**Back both files up** somewhere that is not this machine and not the repo — a password
manager holds both comfortably.

### 3. Build

```powershell
npx expo prebuild --platform android --clean
cd android
.\gradlew.bat assembleRelease
```

`--clean` rather than the plain `npm run prebuild`: prebuilding over an existing
`android/` merges, and leaves already-written resource files as they are. A release
that inherits stale native config is the exact failure this whole page exists to
prevent, and `android/` is regenerated build output, so there is nothing to lose.

The APK lands at:

```
android/app/build/outputs/apk/release/app-release.apk
```

Confirm it used the right key — if this prints the debug key's `CN=Android Debug`, the
signing config didn't apply and the update path is already broken:

```powershell
keytool -printcert -jarfile app\build\outputs\apk\release\app-release.apk
```

### 4. Install it

With the phone connected:

```powershell
adb install -r app\build\outputs\apk\release\app-release.apk
```

Or copy the APK to the phone and open it — Android will ask permission to install from
that source. `-r` reinstalls over an existing copy, keeping its data.

### 5. Updating later

Rebuild and `adb install -r` again. Bump `version` in `app.json` when you want to be
able to tell builds apart; `versionCode` only matters for the Play Store.

If installing an update ever fails with `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, the two
APKs were signed with different keys. Uninstalling first fixes it and **erases the local
database** — export a backup from the Settings tab before you do that.

---

## Part 2 — Google Play

Only worth it if other people need to install this.

### Before you start, know these

- **$25, once**, for a Google Play developer account.
- **Personal accounts must run a closed test before they can go to production** —
  Google's current rule is roughly 12 testers opted in for 14 continuous days. This is
  the single biggest surprise for someone publishing a personal app, and on its own is
  usually the reason to sideload instead. Confirm the current requirement in the Play
  Console, as the policy has been changing.
- A **personal** developer account publishes your **legal name and address** on the
  store listing. An organisation account avoids that and needs a D-U-N-S number.
- The **package name is permanent**. `com.stephen.groove` in `app.json`
  must become something you own the domain-ish namespace for, e.g.
  `dev.stephenwatson.myapp`, *before* the first upload.
- You need a **privacy policy URL** and a completed **Data safety** form. This app
  stores everything locally and transmits nothing, which makes both short — but "we
  collect nothing" still has to be stated.

### Steps

1. **Set the real package name** in `app.json` under `android.package`. Do this first.
2. **Increment `android.versionCode`** on every upload. Play rejects a reused one. The
   user-facing `version` string is separate and can stay put.
3. **Build an App Bundle**, not an APK — new apps must ship as `.aab`:

   ```powershell
   npm run prebuild
   cd android
   .\gradlew.bat bundleRelease
   ```

   Output: `android/app/build/outputs/bundle/release/app-release.aab`

4. **Opt into Play App Signing** (the default). You upload with *your* key, Google
   re-signs with the key it holds. This is a real safety net: if you lose your upload
   key, Google can reset it. Without it, a lost key ends the app.
5. **Create the app** in the Play Console, complete the store listing (title, short and
   full description, feature graphic, at least two screenshots, an icon).
6. **Upload to Internal testing first.** Up to 100 testers by email, no review delay.
   This is also the sanest way to get the app onto your own phone via the Play flow.
7. Complete **Data safety**, **Content rating**, **Target audience**, and the privacy
   policy link. Play blocks release until every section is green.
8. Promote to production when the testing requirement is satisfied.

### Keeping it alive

- Google raises the **minimum target API level** yearly. An app that doesn't keep up
  stops being discoverable to new users. In practice this means upgrading the Expo SDK
  about once a year, which is what keeping `android/` generated rather than committed
  makes cheap.
- Every release goes through review. Budget days, not minutes.

---

## Pre-release checklist

Both paths:

- [ ] `npm run verify` green
- [ ] `npm run doctor` green
- [ ] App launches from a cold start with no Metro server running
- [ ] Create, delete and reminder all work on a real device
- [ ] Export a backup, wipe the app, restore it — the round trip is the only real proof
      the data is safe
- [ ] Both light and dark themes checked on the device
- [ ] `git check-ignore release.keystore keystore.properties` lists both

Play only:

- [ ] Real `android.package`, never `com.example.*`
- [ ] `versionCode` incremented
- [ ] Privacy policy live at a public URL
- [ ] Data safety form completed
- [ ] Built `bundleRelease`, not `assembleRelease`
