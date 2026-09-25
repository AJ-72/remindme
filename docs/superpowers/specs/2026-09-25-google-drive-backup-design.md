# Google Drive backup + "welcome back" restore (B3) — design

*2026-09-25. Backlog item **B3**. Status: implemented 2026-09-25 (jest only; device checks D100). One deviation: `completeRegistration` lives in `services/registration.ts`, not `InvitationService.ts`, so tests that auto-mock InvitationService still exercise it.*

## Why

Two restore paths exist today, and neither covers the cases that matter
most:

| Path | Covers | Misses |
| --- | --- | --- |
| Android Auto Backup | Android → Android when the new phone is set up *from* the old phone's backup, same signing key | iOS; a fresh Android setup that skips "restore from backup"; any install where the backup never ran |
| Manual JSON export/import (`app/backup.tsx`) | Anything, if the user remembered to export | Everyone who didn't (almost everyone) |

**D1 result, 2026-09-25** (OnePlus `b81a371a`, EAS build, confirmed on
screen by the user): Auto Backup *does* restore reminders, settings, the
user's name, the registered number **and the Supabase session**. After
reinstall no new anonymous auth user was created and user `a1b3cf60`
refreshed its token immediately. So after an Auto Backup restore, nothing
extra is needed. This feature is for everything else.

Two findings from that run shape this spec:
- `bmgr backupnow` refused ("Backup is not allowed") while the app was
  **force-stopped**. Android skips stopped apps, so an OEM battery manager
  that force-stops us may silently block Auto Backup. That's another reason
  not to rely on it alone.
- The registered phone number only lives in AsyncStorage
  (`@registered_phone_v1`). The server keeps an irreversible peppered hash.
  So when a fresh install has no backup, the number is simply gone and has to
  be retyped.

## Goals

1. Reminders, settings, name and registered number back themselves up to
   the user's Google Drive **automatically**, once the user has signed in.
2. On a **genuinely empty install**, one "Welcome back" flow restores the
   reminders **and** moves the number to this phone in a single confirm.
3. Each half still works on its own: Drive backup/restore from
   Settings → Backup, and number registration or reclaim from
   Settings → Add your number (unchanged).

## Non-goals

- Live multi-device sync. There's one file, and the most recent write wins
  (see the invariants for how that is made safe).
- Restoring from a *specific* older backup (no version history).
- OTP verification of the number. Trust stays at the existing
  `selfRegister` level; see "Number move".
- Encrypting the file beyond what Google Drive already does.

## Design

### 1. Backup file: format v2

`utils/reminderBackup.ts`: `BACKUP_VERSION` goes from 1 to 2 and a new
optional block is added:

```ts
export interface BackupIdentity {
  userName?: string;        // "" / absent = none
  registeredPhone?: string; // E.164, absent = never registered
}
interface ReminderBackup { …; identity?: BackupIdentity }
```

- `parseBackup` accepts v1 (no identity) and v2. It validates
  `registeredPhone` as E.164 and **drops** an invalid one rather than
  rejecting the file, because the reminders are what matter most.
- `buildBackupJson()` fills in `identity` from `getUserName()` and
  `getRegisteredPhone()`. The manual export gets this too.
- Manual import (`importRemindersFromJson`) restores `userName` only if the
  local one is empty, and **never** touches the registered number. Moving
  the number is an explicit, confirmed action (§5), not an import side
  effect.
- New pure helper: `backupContentHash(json)` hashes the file with
  `exportedAt` stripped. This drives "only upload if changed".

### 2. `services/DriveBackupService.ts` (new)

This is the only module that knows about Google. Screens call it and never
call Google or Drive directly.

- Library: `@react-native-google-signin/google-signin` (free API, config
  plugin; needs a native rebuild, not Expo Go). Scope:
  `https://www.googleapis.com/auth/drive.appdata`, which Google classifies as
  **non-sensitive** (checked on 2026-09-25 against
  developers.google.com/workspace/drive/api/guides/api-specific-auth), so
  no verification review is needed.
- The Drive REST API is called with plain `fetch` and the access token from
  `GoogleSignin.getTokens()`. There's no Drive SDK dependency.
- **One file**, `reminders-backup.json`, in `spaces=appDataFolder`. The
  file is hidden from the user's Drive UI and only this app's OAuth project
  can read it, on Android and iOS alike (same Cloud project).
- API:
  ```ts
  isConfigured(): boolean                // client IDs present; false under Jest/dev → every call no-ops
  getAccount(): Promise<{ email } | null>
  signIn(): Promise<Result<{ email }>>   // interactive
  signOut(): Promise<void>               // also clears lastBackup state
  findBackup(): Promise<Result<RemoteBackup | null>>   // RemoteBackup = { fileId, modifiedTime, parsed: ParseResult, reminderCount }
  uploadBackup(trigger): Promise<Result<{ uploadedAt } | { skipped: "unchanged" | "guard" }>>
  getBackupStatus(): Promise<{ email, lastBackupAt, lastError } | null>
  ```
- `Result` errors are a closed union (`"not_configured" | "cancelled" |
  "network" | "auth" | "quota" | "unknown"`). No call throws out of the
  module.
- The fetch layer is injected (same pattern as
  `notificationResponseHandler.ts`) so tests run against a fake Drive with
  no network.

### 3. Invariants (each one gets a test)

1. **Never upload over a backup before this install has decided about
   restore.** `@drive_restore_settled_v1` stays false on a fresh install.
   It is set true only by (a) completing or skipping the welcome-back
   restore, (b) a manual "Back up now", or (c) enabling Drive backup on an
   install that already had data. Auto-backup is a no-op until it is set.
   *Why: without this, signing in on a new phone would back up the empty
   install within 30 seconds and destroy the only copy.*
2. **Auto-backup never replaces a remote file that has reminders with a
   local state that has none.** It is skipped with `"guard"` and logged. A
   manual "Back up now" asks the user to confirm first.
3. **Upload only if changed.** Skip when `backupContentHash` equals the last
   uploaded hash (`@drive_last_hash_v1`).
4. **Restore merges, never replaces.** It reuses `mergeReminders()`
   (local wins, content-identity dedupe), then
   `rescheduleAllFutureReminders()`, exactly as JSON import does.
5. **Never emit the phone number or the email to telemetry.** Events carry
   only `ok`, `trigger`, `error` and counts (the `AnalyticsProps` type
   already enforces primitives; the reviewer checks that no identity field
   is passed).

### 4. Auto-backup triggers

- **Debounced 5 s after any write** (was 30 s; cut on device 2026-09-25 —
  Android freezes a backgrounded app within seconds, so an edit made just
  before leaving waited out the freeze and only uploaded on next open): `saveReminders()` and the settings
  setters call a cheap `markBackupDirty()` hook (a module-level debounce
  in `DriveBackupService`; it doesn't import any UI).
- **App goes to background** (`AppState` → `background`): flush if dirty.
- **Existing BackgroundFetch task** (`tasks/rescheduleTask.ts`): after
  `rescheduleAllFutureReminders()`, call `uploadBackup("background")`. The
  change-hash check makes this cheap when nothing changed.
- Tokens: `getTokens()` refreshes silently via `signInSilently()`. If the
  silent refresh fails, the status shows "Sign in again" with no prompt
  from the background.

### 5. Welcome-back flow (new `app/welcome-back.tsx`)

**Where it's offered.** `NameOnboarding` already shows on first launch
only. When the install is **empty** (no reminders, no registered number,
name prompt not yet seen, and not an invite-link launch, which it already
detects), the name sheet adds a secondary action: *"I've used Reminders
before"*, which routes to `/welcome-back`. After an Auto Backup restore the
install isn't empty, so this never shows. That's the D1 evidence above:
nothing needs doing there.

**Phases:**
`intro → signing-in → searching → found | not-found | error → restoring → done`

- **found**: one screen with the backup's age and two checkboxes, both on
  by default:
  - ☑ *Restore **42 reminders** and your settings* (backed up 2 days ago)
  - ☑ *Move your number **+91 98••• ••210** to this phone*. Helper line:
    *"Reminders people send you will arrive here. Your old phone will be
    signed out of reminders from others."* This box only appears if the
    backup has a `registeredPhone`.
  - **[Restore]**, plus *"Start fresh instead"* (sets restore-settled and
    goes home).
- **not-found**: *"No backup found for you@gmail.com"* → *Import a file
  instead* (existing backup screen), *Try another account*, or
  *Start fresh*.
- **restoring**: runs, in order: (1) merge reminders, reschedule, apply
  settings; (2) set name if empty, and mark the name prompt seen; (3) if
  the number box is ticked, move the number (below); (4) set
  restore-settled; (5) do an immediate `uploadBackup("restore")` so the
  Drive copy now reflects this device.
- **done**: *"42 reminders restored"*, plus the invitation-claim result
  when the number moved (reusing the claimed-list UI).

**Number move.** `selfRegister(e164)` runs first. On `number_taken`, it
runs `selfRegister(e164, "migrate")`, the same server path as
register-number's *"Yes, it's my old account — keep its history"*. The
ticked checkbox plus its helper line **is** the confirmation. It replaces
register-number's separate *"Move to this device?"* screen for this flow
only, because the user has already shown more evidence than the manual
path gets: the number came from a file in their own Google account, not
from typing. **"Reset" (erase old account) is never offered here**: it is
destructive and belongs to the manual flow only.

To avoid a second copy of the success path, `finishRegistration()` moves
out of `register-number.tsx` into `services/InvitationService.ts` as
`completeRegistration(phoneE164, method)`. It sets the registered phone,
syncs the name, registers push and claims invitations, and returns
`claimed`. Both screens call it. `method` gains `"drive_restore"` for the
`NUMBER_REGISTERED` event.

If the number move fails, the reminders are **already restored**. The done
screen says *"Reminders restored. Couldn't move your number — add it in
Settings"* and the restore isn't rolled back.

### 6. Settings → Backup screen changes (`app/backup.tsx`)

A new **Google Drive** section above the existing file export/import:
- Signed out: *"Back up to Google Drive automatically"* → sign in. If local
  data exists and a remote backup also exists, the user chooses between
  *Restore from it* (merge) and *Replace it with this phone's reminders*.
  This is invariant 1 on the non-welcome path.
- Signed in: account email, *"Last backed up 5 min ago"* or the last error,
  **Back up now**, **Restore from Drive** (merge, with confirmation of
  counts), and **Stop backing up** (sign out; the remote file is left in
  place, as the copy says).
- The file export/import section stays as it is: it's the only path that
  doesn't need a Google account.

### 7. Telemetry

New catalogue entries in `constants/analytics.ts`, each with a real
emitter (the catalogue test enforces this):
`drive_backup_result {ok, trigger, error, skipped}`,
`drive_restore_result {ok, source: "welcome_back"|"settings", added, duplicates, number_moved}`,
`drive_signin_result {ok, error}`.

## Testing

Jest (all Google/Drive network is faked):
- `reminderBackup.test.ts`: v1 still parses; v2 round-trips identity; an
  invalid phone is dropped and the file is kept; the hash ignores
  `exportedAt`.
- `DriveBackupService.test.ts`: each invariant 1–3 with a sabotage check;
  find/create/update against the fake Drive; the error mapping; no-op when
  not configured.
- `__tests__/screens/welcome-back.test.tsx`: found → restore both; restore
  reminders only (box unticked); number free → no migrate; `number_taken` →
  migrate; migrate failure keeps reminders; not-found paths; "Start
  fresh" sets settled.
- `register-number.test.tsx` stays green after the `completeRegistration`
  extraction (behaviour-preserving refactor).
- `NameOnboarding`: the welcome-back action shows only on an empty,
  non-invite install.

Device-only (add to `device-tests/cross-cutting.md`, never marked PASS by
the agent):
- Android sign-in with the EAS-signed build; auto-backup lands within about
  1 minute of an edit.
- Fresh install → welcome back → reminders and number restored, and an
  invitation sent to the number afterwards arrives on the new phone.
- The old phone is signed out after the number moves (expected per the
  migrate semantics).
- iOS: the same flow, once an iOS build exists. **Not buildable today**, so
  this stays pending.
- *Open risk from D1:* an Android → Android Auto Backup transfer while the
  old phone is still active leaves both holding the same Supabase refresh
  token. Rotation probably signs one out silently. This needs a test with
  two phones.

## User-side setup (blocking device proof, not code)

Google Cloud OAuth clients (Android per SHA-1, iOS, web) and a consent
screen. Steps: `docs/setup/google-drive-oauth.md`. The client IDs go into
`app.json` (`extra.googleWebClientId`, `extra.googleIosClientId`, plus the
plugin's `iosUrlScheme`). These are not secrets. Until they are set,
`isConfigured()` is false and the whole feature hides itself.

## Order of work

1. v2 format and hash (TDD).
2. `DriveBackupService` and the invariants (TDD, fake Drive).
3. Auto-backup triggers.
4. Extract `completeRegistration`.
5. `welcome-back.tsx` and the `NameOnboarding` entry point.
6. Changes to the Backup screen.
7. Telemetry.
8. Typecheck and the full suite.
9. Docs: features, shipped (jest only), device-tests, CLAUDE.md pointer,
   and the backlog row deleted.
