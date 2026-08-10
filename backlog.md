P1. All project-related files/processes must stay inside the remindme project folder — no dependency on external paths. Currently local Android dev (Metro, pnpm store, build output) relies on things living outside the repo (e.g. a separate short-path junction/copy at C:\p, C:\n as a workaround for a Windows CMake/Ninja path-length bug — see system_learnings.md 2026-08-03 entries). Fix so Metro and the full local build/run flow work with everything self-contained under remindme, without requiring an external junction, copy, or relocated store.

1. Integrate with google drive to store the reminders to support migration of phone or reinstallation. [MANUAL BACKUP DONE 2026-08-10 — Settings now has "Back up reminders" (shares a JSON backup via the share sheet) and "Restore from backup" (paste the text back). Import **merges**: local always wins on conflict, and duplicates are dropped by content — same title at the same instant — not by id, so a reminder re-typed by hand after a reinstall isn't duplicated. `utils/reminderBackup.ts` holds the pure serialize/parse/merge logic; `buildBackupJson`/`importRemindersFromJson` in `ReminderService.ts` wrap it. Deliberately dependency-free (no `expo-document-picker`) so it ships over-the-air rather than needing a native build — this was a ship-blocker. STILL OPEN: actual Google Drive sync, and file-picker import instead of paste, both of which need a native build. **Check D1 (Device verification) FIRST** — Android Auto Backup is already enabled and appears to be running, so it may already cover phone-migration on Android and make Drive sync largely unnecessary; that test is cheap and changes the scope of this item.]
2. Add audio support and image support [Audio half IN PROGRESS 2026-07-26 — voice-to-text via mic button + forwarded WhatsApp audio (Android only); image support still open. Fixed a real source/destination file-aliasing bug in `transcribeAudioFile()` (found via the debug modal across two rounds: `expo-share-intent` copies WhatsApp's content:// file into our own app cache dir under its original filename *before* handing us the path, so our own copy step was copying that file onto itself — "destination already exists" then "source doesn't exist" once a naive delete-before-copy was added). Real fix: the cached copy always uses a random-prefixed filename so it can never alias the source, and is deleted again after every attempt. LATEST: after that fix + rebuild, sharing now shows literally nothing — no notice, no debug modal, app just opens — meaning the failure is happening somewhere the debug-info wiring doesn't reach (e.g. before `NativeShareIntentCapture`'s effect even runs, or the effect isn't seeing a fresh `shareIntent`/`error` at all). Rather than keep guessing per-round, added a persistent `DebugLogService` (AsyncStorage-backed, survives app restarts) with `logDebug()` calls at every step of the share pipeline (provider mount, capture-component mount, every effect run with the raw `shareIntent`/`error` values, every branch taken, every `transcribeAudioFile` call/result) — plus a "Debug logs" row in Settings to view/share/clear them. Next step: reproduce the "nothing happens" share once more, then open Settings → Debug logs and send the contents — this will show exactly how far the pipeline got even with zero UI feedback]
3. Integrate with calendars?
4. Verify the snooze flow
5. Show the reminder description in notification after taking user's consent [FIXED 2026-07-20]
6. Make the textboxes cleaner. The place holder text is overflowing today. [FIXED 2026-07-20]
7. Get a better icon for reminder app
8. How to publish to playstore for beta
9. Branding - Name of company should be CuriosMind Labs. Get an icon as well. Add an about tab and show an icon plus name as CuriousMind Labs [FIXED 2026-07-22 — placeholder icon only, app icon itself tracked separately in item 7]
10. Bug - Editing and saving the description is not working. I don't see the updated text saved when i open the reminder again. [FIXED 2026-07-21]
11. Bug - Tapping on mark as done in push notification doesn't make the push notificaiton disappear [FIXED 2026-07-21]
12. To be triaged bug - The reminder doesn't work the first time unless I do an edit and save again. This is not always true, but noticed once or twice. Do a a systematic analysis of code to check that everyhing is correct.  [FIXED 2026-07-21 — likely cause; please re-verify on a fresh install]
13. Feature enhancement - Its not easy to add a longer text in reminder box. Also, the ux is not intuitive to tell the user that they don't have to set the time manually and enter the reminder
14. Feature improvement - the parsing of text to understand the time is not very strong. Research whether there is a better alternative
15. Change the sorting of completed reminders. Sort by newest to oldest. Current reminders should be sorted by earliest reminder first in list [FIXED 2026-07-21]
16. Bugs found after new build with speech enabled -1. Enabling the speech option always downloads the language package. 2. The content of the speech is not saved in the reminder box. The speech option remains turned on until I press the button again. 4. The language package is always US English. [FIXED 2026-07-23 — (1) check `installedLocales` via `getSupportedLocales()` before triggering a download, skip if already installed; (2)+(3) mic was using `continuous` multi-utterance mode, which segmented speech into multiple results (dropping/overwriting text) and never auto-stopped after a phrase, leaving the toggle stuck on — switched to single-utterance mode so it captures one phrase and turns off automatically; (4) added `expo-localization` and pass the device's actual locale to both the offline-model download and the recognizer's `lang` option instead of a hardcoded "en-US"]
17. Support manglish and other regional langs typed in english but words are regional

18. Tech debt - `SNOOZE_ACTION_ID` is the string `"SNOOZE_10"`, but snooze durations are now user-configurable (5/15/30/60 min/tomorrow), so the name is misleading. It was deliberately left unchanged when snooze presets were added: the value is embedded in the `categoryIdentifier` of notifications already scheduled on users' devices, so changing it would orphan any notification sitting in a tray at upgrade time. Fix needs a migration story — e.g. register both the old and a new action ID for one release, then drop the old one.

---

## Device verification (needs a real phone + laptop; Jest cannot reach any of this)

Collected 2026-08-10. These are all "written and green in tests, unproven on
hardware". Aggressive OEM power management (Xiaomi/Oppo/Vivo/Realme) is the
recurring risk across several of them — it has now come up twice
independently, so **test on a mid-range OEM device, not a Pixel or emulator**.

**D1. Does Android Auto Backup actually restore reminders?** *(highest value — could close backlog item 1 on Android)*

Evidence so far (2026-08-10, user's own OEM device): Settings → Back up other
data lists **Reminders at 11 MB with the toggle on**, so Auto Backup is
enabled AND has genuinely run. `android:allowBackup="true"` is already in the
generated manifest (Expo's default; nothing was configured for it).

What that does *not* prove: 11 MB is far larger than our data (a few KB of
JSON) and is almost certainly the JS bundle/image cache — sitting next to Expo
Go at 12 MB is the tell. So it is unconfirmed whether `RKStorage` (the SQLite
DB where AsyncStorage lives — verified from source: `ReactDatabaseSupplier
extends SQLiteOpenHelper`, `DATABASE_NAME = "RKStorage"`) is inside the backup
set. Android documents database files as included by default, so it *should*
be. And a settings screen only shows the sending half; the restore half is
what matters.

Procedure (package is `com.curios.remindme`; adb at
`C:\Users\anand\AppData\Local\Android\Sdk\platform-tools\adb.exe`):

1. **Export first via Settings → Back up reminders** — if the restore fails the
   reminders on that phone are gone.
2. `adb shell pm list packages | grep curios` → must print
   `com.curios.remindme`. A package-name mismatch is exactly what produced a
   false negative in the async-storage repo's own bug report.
3. `adb shell bmgr backupnow com.curios.remindme` → wait for
   `Backup finished with result: Success`. Captures current state rather than
   whatever last night's scheduled run happened to grab.
4. `adb uninstall com.curios.remindme` — use adb, **not** the launcher, since
   some OEM launchers offer "keep app data" and would invalidate the test.
5. Reinstall and **DO NOT LAUNCH THE APP**. Restore lands *after* install and
   *before* first launch; opening it early is the most common false negative.
6. `adb shell dumpsys backup | grep -i "restore\|com.curios"`, then open the app.

Reading the result: reminders present → Auto Backup works end to end, item 1
is effectively solved on Android and Drive sync drops well down the roadmap.
App empty → the 11 MB is cache; confirm with
`adb shell run-as com.curios.remindme ls -la databases/` (debuggable builds
only) and, if `RKStorage` is present but not surviving, add explicit
`dataExtractionRules` — which then needs a native build.

Caveats: must be the standalone build, **not Expo Go** (which backs up
separately — it is its own row in that screenshot). Auto Backup needs device
idle + Wi-Fi + 24h since last run, so on a battery-aggressive OEM ROM it may
simply never fire unaided; step 3 forces it, which proves the plumbing but not
the everyday behaviour. **Do not ship any Settings copy claiming automatic
backup until this passes** — on a Redmi it may be false, and a wrong promise
about data safety is worse than saying nothing. Manual export stays the
primary mechanism regardless: it is the only path identical across every
device and the only one that works on iOS.

**D2. Vibration setting** — needs a **fresh install or cleared app data**.
Android creates a notification channel once and never updates it, so the new
`reminders-alarm-novibrate` channel won't exist on an existing install and the
fix will look like it failed. See the 2026-08-09 ledger entry.

**D3. Mark Done / Snooze from a notification with the app fully closed** —
the TaskManager path (`tasks/notificationResponseTask.ts`). Jest covers the
listener only.

**D4. Duplicate notifications** — the `ALARM_EARLY_OFFSET_MS` fix. Needs a
reminder left to fire naturally, ideally across a background-fetch cycle.

**D5. Large notification icon** — the `withLargeNotificationIcon` config
plugin. Needs a native build.

**D6. Malayalam dictation end-to-end** — parser tests use *typed* text; the
speech recognizer's actual output is unverified. Settings → Debug logs shows
the raw transcription.

**D7. OEM battery-killer survival** — do scheduled alarms fire at all on
Xiaomi/Oppo/Vivo with battery optimization at its default aggressive setting?
This is the cross-cutting risk behind D1 and D4 and is currently a blind spot;
it was flagged as a listing blocker in the 2026-08-09 adoption assessment.

---

## Major features

The headline features, tracked together so they don't get lost among bugs
and tech debt. Each needs its own brainstorm → spec → plan cycle; none is a
drop-in change.

Strategic context: the 2026-08-09 adoption assessment found the app's real moat
is on-device Malayalam parsing (no account, no network) rather than the reminder
list itself, and that M4 — reminding other people — is the roadmap item with no
incumbent. M7 was added later the same day and revises that report's read of M4
Tier 2. Prefer features that deepen those two things over ones that widen the
app's surface.

M1. **Dark mode** - the app ignores the system light/dark setting. Two independent causes, both must be fixed: (a) `app.json` pins `"userInterfaceStyle": "light"`; (b) `constants/colors.ts` has no `dark` key at all, so `useColors()` falls back to the light palette by design (documented in the hook). Deferred 2026-08-09 as its own task because it needs a full dark palette authored from the light tokens plus an audit of every hardcoded color across all screens. Decide at the same time whether to add a Light/Dark/System override in Settings (would require `useColors` to read a persisted setting rather than `useColorScheme()` alone).

M2. **Recurring reminders** - "every day at 8", "every Monday", "monthly on the 1st". Repeatedly identified as the highest-value missing feature. Known constraints from earlier analysis (2026-08-07): (a) `chrono-node` does NOT return recurrence info — it silently drops "every day"/"daily" and the word is left stranded in the reminder title, so recurrence parsing must be built, not configured; (b) `malayalamDateParser.ts` has no recurrence support either; (c) the codebase schedules only one-shot `SchedulableTriggerInputTypes.DATE` triggers, so either a repeating trigger type or a rolling re-schedule-on-fire scheme is needed — the latter interacts with the boot-reschedule task and the ALARM_EARLY_OFFSET_MS window (see system_learnings 2026-08-09 duplicate-notification entry); (d) UI surface is larger than it first appears — `add-reminder.tsx` (~630 lines) and `QuickAddInput.tsx` (~810 lines) both need changes; (e) the `Reminder` interface and its AsyncStorage records need a migration.

M3. **Location-based reminders** - "remind me when I reach home / leave office / am near a pharmacy". Needs geofencing (`expo-location` + `expo-task-manager`, the latter already a dependency and already used for the boot-reschedule and notification-response tasks). Significant new surface: background location permission is a separate, more heavily-scrutinized Android/iOS permission than notifications and requires Play Store justification; geofence limits are per-OS (Android ~100 per app); battery impact needs review; the `Reminder` model gains a location trigger alongside the datetime one, so "when does this fire" stops being a single timestamp. Also decide whether time and location triggers can combine ("at 6pm only if I'm home").

M4. **Remind someone else** - remind another person/contact, or a group ("remind my husband/kids/parents"). Split into two tiers after a design interview on 2026-08-09:

- **Tier 1 — PLANNED, not started.** Plan: [`docs/superpowers/plans/2026-08-09-remind-someone-else-tier1.md`](docs/superpowers/plans/2026-08-09-remind-someone-else-tier1.md). At reminder time the *sender's* phone rings; they tap and send a pre-filled WhatsApp/SMS message. Entirely on-device — no backend, no accounts, no push tokens. Recipient picked from phone contacts; outgoing messages carry a witty app invite (capped at 3 per person) which is what makes Tier 2 viable later. **Honest framing that constrains all copy: this is "remind me to message someone", not "remind someone else" — the recipient's phone never rings.** 14 TDD tasks; adding `expo-contacts` needs a new native build (no OTA).
- **Tier 2 — deferred, needs its own design.** True app-to-app delivery with acknowledgement flowing back, for recipients who install the app. This is the part that cannot be built on-device: it needs push tokens, an account/identity model, auth, and a deployed server. None exist today — verified 2026-08-09 that the API server has exactly one endpoint (`GET /api/healthz`) and `lib/db/src/schema/index.ts` defines zero tables. So this is also the feature that would finally wire up the API server and `lib/db` (see CLAUDE.md). Tier 1's data model deliberately keeps `recipient` an *object* so `appUserId`/`deliveryStatus`/`acknowledgedAt` can be added as purely additive optional fields.

M5. **Integrate with other apps / forward-to-remind** - create a reminder by forwarding or sharing from WhatsApp, Google Calendar, email, etc. Partially built: `expo-share-intent` already handles shared text, URLs, and audio (WhatsApp voice notes → transcription), see `contexts/SharedTextContext.tsx` and backlog item 2. Still open: images (item 2), calendar integration (item 3 — "Integrate with calendars?", which should be folded in here or explicitly split into read-events vs. create-reminder-from-event), and a general review of which apps' share payloads are worth first-class handling. Consolidates items 2 and 3 rather than replacing them.

- **Sub-item: "leave now" reminders that deep-link to a cab app.** Considered and deliberately deprioritized 2026-08-09. Fire at *leave* time ("Leave now for Dr. Menon") with a button opening Uber/Ola with the destination pre-filled. **Deep link only — do not attempt the ride-request API or an Uber MCP server.** Requesting a ride is a privileged Uber scope requiring approval via a business-development contact; the community MCP servers on GitHub are unofficial wrappers over that same gated API (one ships a *mock* interface with deep-link fallback precisely because access is usually unavailable). MCP is a protocol for calling APIs, not for being authorized to call them, and it needs a model in the loop — which would spend the app's "on-device, no account, no network" differentiator to buy a commodity feature. Also note Uber is not the Indian default: Ola, Rapido and Namma Yatri hold serious share, and Rapido's bike taxis dominate exactly the short hops a reminder would trigger. Honest gap: a deep link cannot compute travel time, so *when to fire* is guesswork without a maps lookup. Reuses M4 Tier 1's `Linking.openURL` + fallback pattern almost verbatim. Low priority — competes with opening Uber directly, which takes about four seconds.

M6. **Remind a contact from natural language** *(builds on M4 Tier 1)* - "Remind my husband to pick up milk" — resolving the recipient from the reminder text instead of tapping through a picker. M4 Tier 1 deliberately uses an explicit contact picker, so this is a later refinement on top of it: it needs contact resolution from free text, relationship aliases ("my husband" → a specific contact), and disambiguation ("which David?"). Note it would also need to work in Malayalam, where the parser is hand-written (`utils/malayalamDateParser.ts`).

M7. **Group reminders with RSVP** *(shares M4 Tier 2's backend)* - raised 2026-08-09 as "book turfs or movie tickets via the group reminder". The booking is **not** the feature; the coordination around it is, and that reframing is the whole item.

**The problem nobody owns.** Nine people in a WhatsApp group, "who's in for Saturday 6am football?", three confirm, two go silent, someone books anyway, two don't show, the payment split never resolves. Booking the turf itself is already easy (Hudle/Playo, ~30 seconds). The coordination dies in WhatsApp.

**Why this is M4 Tier 2, not a new backend.** Tier 2 is defined as app-to-app delivery *with acknowledgement flowing back*. Acknowledgement **is** RSVP. A group reminder that tracks who confirmed is Tier 2 aimed at a group rather than one person — same push tokens, same identity model, same server, all of which have to be built either way.

**Why it matters strategically.** The 2026-08-09 adoption assessment priced Tier 2 as a caregiving feature (diaspora child checking whether a parent took medication) — real but narrow, and it retains only one persona. Group coordination is a materially larger market on the *same* infrastructure, and it's the first roadmap item that gives the young-urban-professional persona a reason to stay rather than churn in week one. **This is a correction to that report's read of Tier 2, not a new feature area.**

**Booking is the last tap, not the product.** Once N people confirm, deep-link out to Hudle / Playo / BookMyShow. Verified 2026-08-09: **BookMyShow publishes no official public API and runs no partner program** — everything available is scraping (Apify, Parse.bot) or reverse-engineered GitHub projects, which is ToS-violating and breaks without notice. Hudle and Playo document integration only for *venue partners*, not consumer apps. So the division is forced and also correct: we own coordination, they own the transaction. Same `Linking.openURL` pattern as M4 Tier 1. **Do not build a booking integration.**

**Open questions before this gets a spec.** (a) It is arguably a *different app* — group RSVP for weekend football shares almost nothing with a Malayalam-parsing personal reminder list, and two products in one binary usually means neither gets good. (b) It forks with M4 Tier 2's caregiving use case: same infrastructure, different audience, and the audience choice drives the UI. (c) Group identity without accounts is unsolved — Tier 1's phone-number-as-key approach may or may not stretch to groups. (d) Malayalam support for group flows is unexamined.
