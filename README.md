# Groove

A local-only habit tracker for one phone. Habits on the days you actually do them,
reminders that stop nagging once you've ticked the box, and an honest read on how you're
doing.

**Expo SDK 57** · **React Native 0.86** · **React 19** · **TypeScript** ·
**expo-router** · **expo-sqlite** · **Vitest** · Android

Everything is on the device. No server, no account, no network — which also means a lost
phone loses the data, so the export exists.

## What it does

| Area | Behaviour |
| --- | --- |
| **Habits** | Daily on a weekday mask (*Mon–Thu*, *every Sunday*, *every day*), or a flexible target — *3× a week*, *2× a month* |
| **Today** | Only the habits actually due, ticked with one tap |
| **History** | Any past day is editable — full CRUD over what you did and when |
| **Reminders** | A local notification at the habit's due time, then follow-ups until it's done. Ticking it cancels the rest of the chain |
| **Analytics** | Completion rate against *scheduled* days, streaks, and a weekly or monthly grade |
| **Goals** | A target rate per habit; anything below it surfaces as needing improvement |
| **Profiles** | Separate habit lists — personal, work — one active at a time. No login |
| **Backup** | Export the whole database to JSON via the share sheet; restore it on another phone |

## Deliberately absent

- **No backend, accounts, auth, or network.** That is the point.
- **No light theme.** Dark only, so there is no provider and no runtime switch.
- **No migration system.** The schema is authoritative; the database is rebuilt to match
  it when it changes. This app has never shipped, so there is no older data to preserve.
- **No iOS.** Android-first, and the release tooling signs an APK.

## Running it

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for the build-and-run loop.

```
npm run verify      # test -> typecheck -> lint -> deadcode -> secrets
npm run doctor      # expo-doctor
npm run android     # the only thing that proves it actually builds
```
