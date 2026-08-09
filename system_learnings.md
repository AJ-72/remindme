# System Learnings Ledger

Running log of non-obvious fixes, config changes, and decisions made while working in this repo.
Read this before starting work — it may save you from re-debugging something already solved.

**Format rule:** one entry per change. State WHAT changed, WHY (root cause, not symptom), and WHERE.
Keep entries short and factual. Do not delete old entries — mark them SUPERSEDED if a later entry replaces them.
Newest entries at the top.

---

## 2026-08-09 — The Bash tool is Git Bash, so PowerShell here-strings silently corrupt commit messages

**WHAT:** a `git commit -m @'...'@` through the **Bash** tool produced a commit whose subject line began with a literal `@`. Fixed with `git commit --amend -F - <<'EOF' ... EOF`.

**ROOT CAUSE:** this environment offers two shells with different syntax, and the repo's own docs describe the PowerShell one. PowerShell's here-string (`@'...'@`) is the correct way to pass a multi-line commit message *via the PowerShell tool*. The Bash tool runs Git Bash (POSIX sh), where `@'` is not syntax at all — it's just an at-sign followed by a quoted string, so the `@` becomes the first character of the message and the closing `'@` is swallowed as trailing text. **Nothing errors.** The commit succeeds and looks fine until you read `git log`.

**FIX / RULE:** match the heredoc form to the tool. Bash tool → `-F - <<'EOF'`. PowerShell tool → `@'...'@` with the closing delimiter at column 0. When a commit message is multi-line, read back `git log -1 --format=%s` before moving on — a mangled subject is invisible from the commit's own success output, which prints only the truncated first line.

**Related trap in the same session:** the working directory persists between Bash calls, so an earlier `cd artifacts/mobile` made a later bare `ls -a` report the *mobile* directory while it read as a repo-root listing. Prefer absolute paths (or a leading `cd /c/workspace/remindme`) in any command whose output you intend to interpret as "the repo root".

**WHERE:** commit `d85ce5e` (amended). No source change.

---

## 2026-08-09 — Independent settings need one channel per COMBINATION, and `useState(prop)` never resyncs

Three device-reported bugs from the same build, two sharing a root cause worth generalizing.

**1. Vibration setting did nothing while sound was on.** `channelIdForAlarm(alarm, vibrate)` returned `"reminders-alarm"` whenever `alarm` was true, discarding the `vibrate` argument — on the theory that "the alarm channel's vibration is part of its own immutable config." That theory made the setting a **no-op in its most common state**: sound defaults on, so the ordinary user toggling vibration off saw no change. Android channel config is immutable by ID, so N independent notification settings need **2^N channels**, one per combination — there is no way to express a combination by editing a channel at runtime. Now four: `reminders-alarm`, `reminders-alarm-novibrate`, `reminders-vibrate`, `reminders-silent`. Also note `vibrationPattern` alone does not enable vibration — set `enableVibrate: true` explicitly (the alarm channel was missing it; existing installs keep the old config forever, so this only helps new ones).

**2. `useState(someProp)` seeds once and never updates.** `QuickAddInput` did `useState(defaultAlarmEnabled)`. It lives on the home screen and **never unmounts**, and the setting loads asynchronously *after* mount — so the initial load and every later Settings change were both invisible to it. Fix: a `useEffect` syncing on change, guarded by a `useRef` "user has touched this" flag so a deliberate per-reminder override isn't clobbered. **Any `useState(x)` where `x` is a prop or context value is a resync bug waiting to happen unless the component remounts.**

**3. Hardcoded reset after save.** The same screen did `setAlarm(true)` after saving, ignoring the user's default — a lit bell with sound off. Trivial once seen, invisible for weeks because **the component had zero alarm-state tests**.

**Layout note (same build):** the multiline-input change set `alignItems: "flex-end"` on the quick-add row, which is right for the growing TextInput but pushed the mic/notes/alarm/save icons to the bottom of a tall capsule. Fix: wrap the buttons in their own `flexDirection: "row"` + `alignItems: "center"` group with a `minHeight` matching the button size, so they align to *each other* rather than the row baseline.

**WHERE:** `services/ReminderService.ts` (`channelIdForAlarm`, `setupNotificationChannel`), `components/QuickAddInput.tsx` (alarm state + `actionRow`), tests in `services/ReminderService.test.ts` and `__tests__/components/QuickAddInput.test.tsx`.

---

## 2026-08-09 — A test named for a behavior it never asserts is how the header date shipped missing

**WHAT:** the home screen header was meant to show the current date beside "Today" (mockup 2a). It shipped without one and stayed that way until a user asked. Added `utils/formatHeaderDate.ts` and wired it into `app/(tabs)/index.tsx`.

**ROOT CAUSE — the gap was in the plan, not the implementation.** Task 3 of `docs/superpowers/plans/2026-08-03-mockup-2a-restyle.md` is titled *"Today title + date/count subtitle"*, but the markup it specifies in Step 3 reuses the previous subtitle logic verbatim (`"N upcoming"` / `"All caught up!"`). The date exists in the task's title and nowhere in its code. An implementer following the steps exactly — correct behavior — produces a header with no date.

**Why nothing caught it:** the accompanying test was named `"shows a 'Today' header with a date and upcoming-count subtitle"` and asserted only `"Today"` and `"2 upcoming"`. **A test named for a behavior it doesn't check is worse than no test — it reads as coverage in every later audit.** When a test name mentions something, grep the body for an assertion on it.

**Also note:** the rest of that restyle (`headerRow`, `headerAvatar`) *was* applied to `index.tsx`, yet the plan file itself is still untracked and uncommitted — so don't assume an uncommitted plan is unimplemented, or that a committed screen matches its plan.

**Formatting decision:** month names are spelled out in the util rather than using `toLocaleDateString`. The required shape ("08, August 2026" — padded day, comma, full month, year) isn't reachable from one locale format, and `Intl` month names follow the *device* locale, which would silently render the header in Malayalam on a Malayalam-set phone.

---

## 2026-08-09 — Duplicate notifications: the early-trigger offset opens a 60s window where a delivered reminder still looks "pending"

**Symptom:** two identical notifications for the same reminder, both showing "Now".

**ROOT CAUSE:** `scheduleNotification` fires the trigger `ALARM_EARLY_OFFSET_MS` (60s) *before* the reminder's `datetime`, to counter Doze delivery lag. So for that final minute the notification has **already been delivered** while `datetime > now` is still true. `rescheduleAllFutureReminders` (BackgroundFetch, every 15 min) guarded only on `datetime <= now`, so inside that window it treated the reminder as pending, "cancelled" it — a no-op, since `cancelScheduledNotificationAsync` only stops a *pending trigger* and cannot un-deliver a notification already in the tray — and scheduled a second copy, which fired immediately.

**The compounding failure:** the new id then overwrote `notificationId` in AsyncStorage. Every cancel path in this service keys off that single stored id, so the first notification became an **orphan nothing could ever cancel** — it would keep being re-armed on later reschedules.

**FIX (two parts, both needed):**
1. The reschedule guard subtracts the offset: `datetime - ALARM_EARLY_OFFSET_MS <= now` → skip.
2. `cancelScheduledForReminder(reminderId)` sweeps `getAllScheduledNotificationsAsync()` and cancels every request whose `content.data.reminderId` matches, instead of trusting the stored id. This makes orphans already on users' devices self-healing.

**Generalizable rule:** whenever a scheduled time is deliberately offset from a logical time, **every guard comparing "has this happened yet" must use the same offset**. Comparing against the logical time is off by exactly the offset window.

**Testing note:** `getAllScheduledNotificationsAsync` was missing from `__mocks__/expo-notifications.ts`, so the sweep would have silently no-opped in tests while looking correct. When adding a code path that calls a new notification API, check the mock exports it — an absent mock function fails as `undefined`, not as a visible error.

---

## 2026-08-09 — Notification action buttons need a TaskManager task; a React listener alone is a no-op when the app is closed

**Symptom:** "Mark Done" on a fired reminder's notification did nothing. Tapping it dismissed the notification but the reminder stayed incomplete — though it often *did* apply later, once the app was next opened, which made it look intermittent.

**ROOT CAUSE:** `MARK_DONE_ACTION_ID` sets `opensAppToForeground: false`, so Android delivers the action without launching the app. The only response handler was `addNotificationResponseReceivedListener` registered inside a React `useEffect` (`components/NotificationResponseHandler.tsx`) — which by definition only exists while the app is running. No JS ran at all.

expo-notifications' own Android source says this explicitly, in `ExpoHandlingDelegate.handleNotificationResponse`:
> "NOTE the listeners are not set up when the app is killed and is launched in response to tapping a notification button — this code is a noop in that case"

and in the same function: `if (!isAppInForeground()) { runTaskManagerTasks(...) }`. **A TaskManager task is the supported path for headless action buttons on Android** — not only for remote push, which is how the docs read at first glance.

**Why it looked intermittent:** the native side queues unhandled responses in `sPendingNotificationResponses`, and `getLastNotificationResponseAsync()` drains that queue on next launch. So the action was applied eventually — at next app open — rather than lost.

**FIX:** `tasks/notificationResponseTask.ts` — `TaskManager.defineTask` at module load (imported from `index.ts`, same pattern as `rescheduleTask.ts`), registered via `Notifications.registerTaskAsync`. Reuses the existing pure `handleNotificationResponse` with headless deps: no navigator, and a per-invocation dedupe ref since each wake gets a fresh JS context.

**Testing note:** `expo-task-manager` has no native module under Jest — importing anything that loads it throws `Cannot find native module 'ExpoTaskManager'`. Added `__mocks__/expo-task-manager.ts`, which also records defined tasks so the task body itself can be invoked in a test. iOS does not run background tasks for notification responses at all (expo matches that deliberately); there the foreground listener still handles them.

---

## 2026-08-09 — Android's large notification icon is only reachable from a config plugin, not from JS

**WHAT:** to show the app icon in the expanded notification, added `plugins/withLargeNotificationIcon.js` (registered in `app.json`).

**WHY NOT JS:** `ExpoNotificationBuilder.kt` sets the large icon from either (a) manifest meta-data `expo.modules.notifications.large_notification_icon`, or (b) `notificationContent.containsImage()`. Path (b) looks like a JS route but **`containsImage()` is implemented only by `RemoteNotificationContent`** (remote push, resolved from a download URL) — locally scheduled notifications never take that branch. So (a) is the only option, and `expo-notifications`' own config plugin exposes no setting for it.

**WHY NOT A MANUAL MANIFEST EDIT:** `artifacts/mobile/android/` is prebuild-generated and gitignored — a hand-edit is wiped by the next `expo prebuild` and can't be committed. Same class of trap as the CMake pin in CLAUDE.md.

**Don't confuse the two icons:** the small status-bar icon (`notification-icon.png`, set via the expo-notifications plugin's `icon` option) is **silhouetted by Android** — every non-transparent pixel becomes one flat tinted shape. A full-color app icon there renders as a solid square. That is platform behavior, not a bug, and it's why the large icon is a separate mechanism.

**Verify with:** `npx expo prebuild --platform android --no-install`, then check the meta-data line in `android/app/src/main/AndroidManifest.xml` and that `android/app/src/main/res/drawable-{m,h,xh,xxh,xxxh}dpi/large_notification_icon.png` all exist at 64/96/128/192/256px.

---

## 2026-08-09 — Malayalam agglutination, round 2: duration units, the -ഇൽ locative, and fused fraction hours

**WHAT:** three device-reported parser gaps, all the same underlying shape as the earlier `മണി` suffix issue.

1. **`മിനുട്ട്` (loanword) vs `മിനിറ്റ്` (native)** — `resolveDuration` only matched the latter. Speech recognizers emit both.
2. **The `-ഇൽ` locative** ("in five minutes") — only `കഴിഞ്ഞ്` was matched. **Bind `-ഇൽ` to the time unit, never treat it standalone**: it is an ordinary locative that appears on unrelated title words (`ഓഫീസിൽ` = "at the office"). There is a regression test pinning this.
3. **Fused fraction hours** — `അഞ്ചര` (5:30) is one token (`അഞ്ച്` + `അര`), so the two-token "അര + മണി" patterns never saw it. Likewise `നാലേ മുക്കാല്` (4:45), `അഞ്ചേ കാൽ` (5:15). These branches **must run before the bare-hour branch** or `അഞ്ചര` is partially eaten as `അഞ്ച്` (5:00), silently dropping the `ര`.

**Compounding symptom worth knowing:** `ഇന്ന് അഞ്ചു മിനുട്ടിൽ` resolved to *today 9:00 AM*. Not a separate bug — `ഇന്ന്` matched as a day, the duration didn't match, no clock time was found, so the `setHours(9,0,0,0)` day-default fired. **A wrong-looking time is often a missing match plus the 9 AM default, not a bad time calculation.**

**The chillu trap:** `ർ` is its own character, not `റ` + a sign. Writing `മണിക്കൂറ?` to make the ending optional matches `മണിക്കൂ` and strands a bare `ർ` in the title. Alternate whole endings instead: `മണിക്കൂ(?:ർ|റിൽ)`.

**A green test suite hid a real defect here.** The period-biased fraction branch built `matchedText` by joining `"<period> <fraction>"`, which `stripMatch` then couldn't find when the two words weren't adjacent (`രാവിലെ ഓഫീസിൽ അഞ്ചര`) — the replace silently no-opped and the whole phrase stayed in the title while the *time* resolved correctly. Every test passed because none used a non-adjacent phrase. `stripMatch` now takes several parts. **When a match spans words that need not be contiguous, strip each part independently rather than fabricating a span.**

---

## 2026-08-09 — `flex: 1` on a `Text` inside a nested column `View` makes the label invisible on device

**Symptom:** on the Settings screen, the row titles ("Play alarm sound by default", "Show description in notifications") were invisible on a real Android device — only the grey sub-label under each one rendered. Every test passed and the text was present in the rendered tree.

**ROOT CAUSE:** the shared `alarmLabel` style carried `flex: 1`. That was correct when the label was a direct child of the card's `flexDirection: "row"` container, but the markup had since moved it inside a nested `<View style={{ flex: 1 }}>` alongside its sub-label. In a **column** (RN's default `flexDirection`), `flex: 1` makes the title compete with the sub-label for *vertical* space and collapse to zero height. Rule: row-level flex belongs on the wrapping `View`, never on the `Text` that ends up nested inside it.

**Why it was invisible to the test suite:** Jest renders a tree, not pixels — `findByText` finds a zero-height element just fine. The existing settings tests only asserted the *sub*-labels, so nothing failed. The regression test added for this asserts `StyleSheet.flatten(label.props.style).flex` is `undefined`; a text query alone cannot catch a layout collapse.

**WHERE:** `artifacts/mobile/app/(tabs)/settings.tsx` (`alarmLabel` style + the three rows using it), test at `artifacts/mobile/__tests__/screens/settings.test.tsx`.

---

## 2026-08-07 — `artifacts/mockup-sandbox` typecheck fails on duplicate `@types/react`; it is NOT caused by your change

**Symptom:** `pnpm run typecheck` (repo root) exits 1 with `TS2322` in `artifacts/mockup-sandbox/src/components/ui/calendar.tsx` and `spinner.tsx`, complaining `Type 'VoidOrUndefinedOnly' is not assignable to type 'VoidOrUndefinedOnly'. Two different types with this name exist, but they are unrelated.` Output above it shows `artifacts/mobile typecheck: Done` — the mobile package is clean.

**ROOT CAUSE:** two copies of `@types/react` resolve in the pnpm store, so `React.Ref<T>` from one is structurally identical to but nominally distinct from the other. `mockup-sandbox` has not been touched since `316333b` ("Initial commit"); the failure is environmental/dependency-graph, not code.

**HOW TO CONFIRM IT'S PRE-EXISTING (do this rather than assuming either way):** `git stash push -u`, `git checkout <commit-before-your-work>`, run `pnpm --filter @workspace/mockup-sandbox run typecheck`, then `git checkout main && git stash pop`. If it fails there too, it is not yours. **Do not skip the `stash pop`** — checking out a detached HEAD mid-verification leaves your working tree behind if you forget.

**Note on an earlier misjudgment:** this failure was once dismissed in-session as "files don't exist / not reproducible" after a `git ls-files` + `ls` check appeared to come up empty. The files do exist and the error is real and reproducible. Verify with the checkout-and-compare procedure above, not by a single spot check.

**Lesson:** a root-level `pnpm run typecheck` covers every workspace package. Read the per-package lines — `<pkg> typecheck: Done` vs `Failed` — before concluding your change broke the build. Scope the check to the package you touched (`npx tsc -p tsconfig.json --noEmit` from `artifacts/mobile`) for a fast, unambiguous answer.

---

## 2026-08-07 — `AppState.addEventListener` cleanup in `RemindersContext` needed optional chaining

**Symptom:** three newly added tests in `RemindersContext.test.tsx` failed with `TypeError: Cannot read properties of undefined (reading 'remove')` at the provider's unmount, even though the tests had nothing to do with `AppState`. The failure appeared only in tests positioned *after* the foreground-reload test.

**ROOT CAUSE:** that earlier test does `jest.spyOn(AppState, "addEventListener").mockImplementation(...)` and calls `mockRestore()` at the end of its body. Combined with the suite's `jest.clearAllMocks()` in `beforeEach`, later tests can see an `addEventListener` that is still a mock and returns `undefined`. The provider then did `return () => sub.remove()` with no guard, so React's unmount teardown threw.

**FIX:** `return () => sub?.remove?.();` in `contexts/RemindersContext.tsx`. This matches the defensive style used everywhere else in the codebase for native handles (`subscription?.remove()` in `NotificationResponseHandler.tsx`, `try/catch` around every `expo-notifications` call).

**Lesson:** `mockRestore()` at the end of a test body is not cleanup — it doesn't run if anything above it throws, and it interacts badly with a global `clearAllMocks`. Prefer `afterEach`/`restoreMocks`. More importantly: an unsubscribe callback that assumes a native API returned a valid handle will take down the entire unmount path. Guard every teardown handle.

---

## 2026-08-07 — `SNOOZE_ACTION_ID` must keep the value `"SNOOZE_10"` even though snooze is no longer 10 minutes

**Context:** designing user-selectable snooze presets (5/15/30/60 min + "tomorrow same time"), which makes the constant name `SNOOZE_10` inaccurate and an obvious-looking cleanup target.

**WHY IT MUST NOT BE RENAMED:** the *value* of `SNOOZE_ACTION_ID` (`services/ReminderService.ts`) is not internal — it is written into the `categoryIdentifier` of every notification handed to `expo-notifications`, so it lives inside notifications already scheduled on users' devices. `handleNotificationResponse` matches incoming `response.actionIdentifier` against it. Changing the string means any notification sitting in a tray across an app upgrade carries the old ID, matches nothing, and its Snooze button silently does nothing. Renaming needs a migration (register both IDs for one release, then drop the old), tracked as backlog item 17.

**Related decision, same commit:** `SNOOZE_MINUTES` *is* deleted rather than kept as a dead export. It was the expected value in three arithmetic test assertions (`ReminderService.test.ts:256`, `:583`, `notificationResponseHandler.test.ts:77`); leaving it while production code stopped reading it would have left tests passing without proving anything.

**Lesson:** before renaming a constant in this codebase, check whether its value crosses a persistence or OS boundary (AsyncStorage keys, notification category/action IDs, Android channel IDs). Those are wire formats with data already in the field, not just identifiers — the same reason `setupNotificationChannel()` carries a legacy-channel migration.

---

## 2026-08-06 — Malayalam hour word `മണി` needed a case-suffix-aware pattern, with a lookahead-guard trap against `മണിക്കൂർ`

**Symptom:** user reported dictated/typed times being ignored — "9 മണിക്ക്" sometimes not recognized, and times silently defaulting to a period word's default hour (e.g. "വൈകിട്ട് 5 മണി" → 18:00 instead of 17:00) whenever the hour lacked the exact literal suffix the parser hardcoded.

**ROOT CAUSE:** `utils/malayalamDateParser.ts` hardcoded the single surface form `മണിക്ക്` in ~6 regexes. Malayalam is agglutinative — the hour word `മണി` legitimately appears bare, or with dative-case suffixes speech recognizers spell inconsistently (`മണിക്ക്` / `മണിയ്ക്ക്` / `മണിക്ക`). Any form other than the one hardcoded literal was invisible to the parser, so the period-word fallback's default hour silently won instead.

**FIX:** added one shared `HOUR_UNIT` pattern and used it everywhere. **Non-obvious trap:** `മണിക്ക` is a strict prefix of `മണിക്കൂർ` (the *duration* unit, "N hours from now", used by `resolveDuration`) — a naive pattern matches inside it and misreads "2 മണിക്കൂർ കഴിഞ്ഞ്" (2 hours from now) as "2 o'clock". The obvious fix — a trailing negative lookahead `മണി(?:യ്)?(?:ക്ക്?)?(?!ൂ)` — is **silently broken**: the optional suffix groups backtrack, the regex engine settles for matching bare `മണി`, and the lookahead then sees `ക` (not `ൂ`) right after and passes anyway. Verified empirically with a standalone Node repro before trusting it. The guard must sit immediately after `മണി`, *before* the optional groups: `മണി(?!ക്കൂ)(?:യ്)?(?:ക്ക്?)?`. A word-boundary guard was also considered and rejected — it blocks `മണിക്കൂർ` correctly but also breaks realistic no-space speech output like `"9 മണിക്ക്മീറ്റിംഗ്"`.

**Lesson:** when one Unicode/script token is a literal prefix of another, negative-lookahead placement relative to optional groups is not interchangeable — test the guard against the collision case directly (e.g. in a throwaway Node script) rather than trusting that "it has a lookahead" is sufficient.

---

## 2026-08-06 — Fire-and-forget async handler raced a test's `waitFor` under parallel jest workers

**Symptom:** `index.test.tsx`'s delete-confirm test failed nondeterministically — reliably green with `jest --runInBand`, reliably red in default parallel mode. Looked like cross-suite pollution at first but reproduced identically on an unmodified checkout via `git stash`, ruling that out.

**ROOT CAUSE:** `HomeScreen`'s `handleConfirmDelete` called `deleteReminder(id)` (async: awaits an AsyncStorage write via `serviceDelete`, then `setReminders`) without `await`, then immediately called `setPendingDeleteId(null)` to close the sheet. This left the delete as a detached fire-and-forget promise, racing the test's `waitFor` default 1000ms timeout. Under jest's default parallel-worker mode, CPU contention from concurrently-running suites was enough to occasionally push that promise chain past the timeout window — a genuine race, not flake noise or pollution.

**FIX:** made `handleConfirmDelete` (`app/(tabs)/index.tsx`) properly `async`/await the delete before clearing `pendingDeleteId`. Also widened `ConfirmSheet`'s `onConfirm` prop type to `() => void | Promise<void>`. Test fix: wrap the confirm `fireEvent.press` in `act(async () => {...})` and give `waitFor` an explicit longer timeout, so the assertion follows real completion instead of racing a fixed clock. Verified with 5 consecutive full parallel `jest` runs, all green — don't conclude "flaky, ignore" from a single red run; rerun with `--runInBand` vs default parallel and diff the behavior before writing something off as pre-existing noise.

---

## 2026-08-06 — expo-speech-recognition needs `continuous: true` or dictation stops at the first pause in speech

**Symptom:** live mic dictation (`QuickAddInput`'s mic button) would stop listening as soon as the user paused mid-sentence, well before they were done speaking.

**ROOT CAUSE:** `SpeechService.ts`'s `startListening()` called `ExpoSpeechRecognitionModule.start()` without `continuous: true` (default `false`). Per the library's own docs: without it, iOS 17- ends the session after 3s of silence, and iOS 18+/Android end it as soon as any `isFinal` result comes in — either way, a natural speaking pause gets treated as "done talking," firing the `end` event, which our listener reads as a user-initiated stop.

**FIX:** pass `continuous: true` in the `ExpoSpeechRecognitionModule.start()` call inside `startListening()` (`services/SpeechService.ts`). Session now stays open through pauses and only ends via our own `stopListening()`/`.stop()` call or a real error.

---

## 2026-08-06 — `Alert.alert` cannot be styled — use a custom Modal sheet for any confirm dialog that needs app styling

**Symptom:** delete-confirmation dialog looked visually out of place (plain OS system alert) next to the rest of the app's themed UI.

**ROOT CAUSE:** `Alert.alert` (React Native's `react-native` module) renders the platform's native OS dialog — it has no style/theme props and cannot be customized. This is inherent to the API, not a bug.

**FIX:** replaced both delete-confirmation call sites (`app/(tabs)/index.tsx`, `app/reminder-detail.tsx`) with a shared `components/ConfirmSheet.tsx` — a transparent `Modal` + `Pressable` overlay bottom sheet, matching the existing bottom-sheet pattern already used elsewhere (e.g. QuickAddInput's "no time found" sheet, Settings' debug-logs sheet). Any future confirm/destructive-action prompt should use `ConfirmSheet` (or the same Modal+Pressable sheet pattern), never `Alert.alert`, if it needs to match app styling.

---

## 2026-08-04 — EAS cloud build failing: local `android/` dir leaking into the upload

**Symptom:** `eas build` from `artifacts/mobile` failed with two errors: (1) `android/local.properties` (Windows-specific SDK path) flagged as leaking into the EAS upload, and (2) Gradle "No matching variant" / "No variants exist" errors for `react-native-community/datetimepicker`, `async-storage`, `gesture-handler`, `keyboard-controller` — as if the build was resolving against stale cached autolinking metadata instead of a fresh one.

**ROOT CAUSE:** this project uses Continuous Native Generation — `artifacts/mobile/android/` is never committed (gitignored) and is meant to be regenerated fresh by `expo prebuild` on EAS's servers every build. But local Windows native builds (`npx expo run:android`, see 2026-08-02/03 entries below) leave a real `android/` dir on disk, including machine-specific `local.properties` and stale `android/build`, `android/app/build` Gradle output from earlier CMake/library versions. With no `.easignore` present, eas-cli's upload step included this local directory, so EAS built against a stale, Windows-specific native tree instead of generating its own — hence both the leaked-path warning and the bogus variant-resolution failures (cached metadata not matching what's actually in `node_modules` on EAS's build server).

**FIX:** added `artifacts/mobile/.easignore`:
```
/android
/ios
```
This forces EAS to always ignore any locally-generated native folders and prebuild fresh, regardless of what's sitting on disk from local Windows builds.

**UPDATE — `.easignore` alone did NOT fix it; real root cause found (see next entry below, 2026-08-05).** Do not stop at this entry's fix.

---

## 2026-08-05 — SUPERSEDES entry above: real root cause was a stray root-level `eas.json` shadowing the mobile one

**Symptom:** identical `android/local.properties` leak warning kept recurring on `eas-cli build` even after `artifacts/mobile/.easignore` (previous entry) was committed and pushed. Repo-side static checks all looked correct (git tracking, `.gitignore`, `.easignore` placement, eas-cli 21.5.0, no `EAS_NO_VCS`) — the `.easignore` fix was real but insufficient, which is what made this confusing.

**ROOT CAUSE:** `git log` on `eas.json`/`.gitignore`/`app.json` history found a **duplicate `eas.json` accidentally committed at the repo root** (`c:\workspace\remindme\eas.json`, commit `ad8e945`, 2026-08-03, bundled into an unrelated design-doc commit) — almost certainly created by running an `eas`/`expo` command from the repo root instead of `cd`-ing into `artifacts/mobile` first. Confirmed it was debris, not intentional: no `app.json` exists at the repo root and no `extra.eas.projectId` in the root `eas.json` — it can't build anything standalone. eas-cli resolves the project root by walking up from cwd to the nearest `eas.json`; with this stray file present, any build invocation risked resolving the whole monorepo as the build root instead of `artifacts/mobile`, uploading the entire repo (including the local, machine-specific `artifacts/mobile/android/` dir with `local.properties`) and never applying `artifacts/mobile/.easignore`, which is scoped to the wrong directory once the root is misresolved.

**TIMING MATCH:** the stray root `eas.json` first appeared 2026-08-03, right around when local Android build support (CMake/Ninja fixes, `npx expo run:android`) was being set up — consistent with the user's report "this worked before we made changes to support android build locally." The local-build work itself didn't break anything; a one-off misplaced `eas` CLI invocation during that same work session did.

**FIX:** `git rm eas.json` at the repo root (commit `b9e9339`). `artifacts/mobile/eas.json` remains the sole authoritative EAS config, matching the documented invocation in CLAUDE.md (`cd artifacts/mobile && npx eas-cli build ...`).

**LESSON:** when EAS Build behavior looks wrong despite correct-looking config in the expected location, check for a **second, shadowing config file higher up the directory tree** — `eas.json`/`.easignore` resolution walks upward from cwd, so a stray file anywhere above the real project root can silently override or bypass the real one. Don't just verify the config you expect is correct; verify no other copy exists that could be found first.

---

## 2026-08-03 — CMake/Ninja Windows fix (see 2026-08-02 entry below) was INCOMPLETE — corrected here

**SUPERSEDES:** the "FIX" in the 2026-08-02 entry below (pinning `externalNativeBuild.cmake.version "4.1.2"` only in `artifacts/mobile/android/app/build.gradle`) is necessary but NOT sufficient. That only fixes the `:app` module's own native build. It does nothing for other native modules (`expo-modules-core`, `react-native-screens`, `react-native-keyboard-controller`, etc.) — each Android Gradle Plugin subproject resolves its own CMake version independently; there is no inheritance from `:app` or from a project-wide default.

**Confirmed root cause of "it worked on the emulator but failed on my physical OnePlus phone" (same repo, no other changes):** the emulator build used architectures `x86_64,arm64-v8a`; the phone build used `arm64-v8a,armeabi-v7a` — a different, previously-uncached architecture combo forced a fresh CMake reconfigure for modules that hadn't been rebuilt before, and those modules were still silently using the broken default CMake 3.22.1/Ninja 1.10, even with the `:app`-only pin already in place.

**THE ACTUAL COMPLETE FIX — three things must ALL be present:**
1. `artifacts/mobile/android/app/build.gradle` — pin for the `:app` module itself (from 2026-08-02 entry):
   ```gradle
   android { externalNativeBuild { cmake { version "4.1.2" } } }
   ```
2. `artifacts/mobile/android/build.gradle` (root, top-level, NOT app/build.gradle) — a project-wide hook that catches every OTHER native module automatically, since most don't have `CMAKE_VERSION` env var support and can't be edited durably (they live in `node_modules`):
   ```gradle
   allprojects {
     // ... existing repositories block ...
     plugins.withId("com.android.library") {
       android {
         externalNativeBuild {
           cmake {
             version "4.1.2"
           }
         }
       }
     }
   }
   ```
   CRITICAL TIMING GOTCHA: this must be set directly inside `plugins.withId { android { ... } }`, evaluated immediately when the plugin applies — NOT wrapped in `afterEvaluate { }`. `afterEvaluate` fires too late: AGP/RNGP has already read and locked the CMake version by then, causing `A problem occurred configuring project ':expo-modules-core' > It is too late to set version`. This cost a full failed build cycle to discover.
3. `$env:CMAKE_VERSION = "4.1.2"` still needed too, for the couple of modules (react-native-worklets, react-native-reanimated) that read `System.getenv("CMAKE_VERSION")` directly in their own `build.gradle` rather than relying on the root project's `externalNativeBuild` block.

**DEAD END — do not retry:** setting `cmake.dir=<path>` in `artifacts/mobile/android/local.properties` does NOT work. This is not a real Android Gradle Plugin / RNGP property for overriding the CMake *version* used per-module; the build silently ignored it and modules kept using the old broken CMake anyway. (Possibly confused with a different, unrelated legacy `ndk.dir`/`cmake.dir` convention from very old Android tooling — doesn't apply here.)

**Always clean stale caches before retrying any CMake version change**, at ALL these levels (missing any one leaves a stale/broken `build.ninja` manifest that fails even with the correct version now configured):
- `artifacts/mobile/android/app/.cxx`, `android/app/build`, `android/build`, `android/.gradle`
- Every native module's own `.cxx` dir under `node_modules/.pnpm/<pkg>/android/.cxx` (find via `find node_modules/.pnpm -maxdepth 4 -iname ".cxx" -type d`)

---

## 2026-08-03 — Black screen on app launch was emulator memory exhaustion, not an app bug

**Symptom:** app installed and launched fine (confirmed via `adb shell dumpsys window | grep mCurrentFocus` showing `com.reminders/.MainActivity` focused, and logcat showing `ReactNativeJS: Running "main"` with no errors/crashes), but the screen rendered solid black — no UI, no status bar icons in the worst case. Persisted across: force-stop + cold relaunch, Metro restart, full `adb reboot` of the emulator (temporarily improved status-bar rendering but app content stayed black, then hit a "System UI isn't responding" ANR on next attempt).

**ROOT CAUSE:** the emulator had run out of memory — `adb shell top` showed only 124MB free out of ~4GB, with `surfaceflinger` and `system_server` both under heavy CPU load (245% sys, 123% irq). This happened gradually from the session's repeated builds/process kills/relaunches. Once RAM is that tight, `surfaceflinger` can't composite frames properly — app logic runs fine (hence no crash/error in logs) but nothing paints, which looks exactly like a broken UI/render bug even though it isn't one.

**FIX:** free host machine RAM (close other heavy apps/processes), which frees emulator RAM too. Confirmed the emulator's `MemFree` jumped from 124MB to 580MB+ (2.6GB available) after freeing host memory, and the app rendered correctly on the very next launch — no code, config, or emulator settings changed.

**DIAGNOSTIC TAKEAWAY:** if an RN/Expo app shows a persistent black screen with NO errors anywhere in logcat, NO bundling failure, and the activity is confirmed focused — suspect emulator resource exhaustion before suspecting app code. Check with `adb shell top -n 1 -m 5` (look at `Mem: ... free` and `surfaceflinger`/`system_server` CPU%) before spending time on font-loading/splash-screen/Fabric-surface theories. A "System UI isn't responding" ANR appearing on an otherwise-idle emulator is a strong tell.

---

## 2026-08-03 — Added Stop hook to enforce this ledger gets updated after commits

**Context:** user wants this file kept current automatically, specifically for a smaller/less capable model reading it later — so entries in this file must stay short, imperative, and scannable (WHAT/WHY/WHERE per entry), not prose.

**WHAT:** added `.claude/settings.json` with a `Stop` hook running `.claude/check-learnings-updated.sh`. On every Claude Code stop, the script compares current git `HEAD` against a marker file (`.claude/.last-learnings-commit`, gitignored — local session state, not committed). If new commits landed since the marker and none of them touched `system_learnings.md`, the hook blocks stop and injects a reason listing the unlogged commits, prompting Claude to add an entry before finishing. If `system_learnings.md` was already touched, or there's nothing new, it's a silent no-op (exit 0).

**WHY:** a static git `post-commit` hook can only run a fixed script — it can't reason about *why* a change mattered, so it can't write a good ledger entry. A Claude Code `Stop` hook fires in-session, after Claude (which has full context on what it just did) would otherwise finish, so it can actually produce a reasoned entry rather than a mechanical commit-hash dump.

**LIMITATION:** this only fires when Claude Code itself is the one committing and then stopping. It does NOT catch manual `git commit` runs from a plain terminal outside a Claude Code session — that would need a separate real git `post-commit` hook (a mechanical stub log, not a reasoned entry) layered on top if ever wanted. Not implemented as of this entry.

**GOTCHA:** the hook's JSON output must be built carefully — the `reason` field can contain a multi-line git log, and naive `cat <<EOF` embedding of raw newlines into a JSON string produces invalid JSON. `jq` was unavailable in this repo's Git Bash environment, so the script manually escapes backslashes/quotes and converts real newlines to `\n` via `sed`+`awk` before printing the JSON line. Validated with `node -e "JSON.parse(...)"` since `jq`/`python` weren't reliably available either.

**GOTCHA:** a newly-created `.claude/settings.json` is not picked up by the running session's file watcher automatically — needs `/hooks` (reload) or a session restart to activate for hooks created mid-session.

---

## 2026-08-03 — Existing junctions already solve Windows path-length for this repo: C:\p and C:\n

**Context:** while cleaning up temp folders from the local-build troubleshooting session, found C:\p, C:\n, C:\g, C:\m, C:\r, C:\w at the drive root, all dated 2026-07-27 (predate that session, not created by Claude).
- `C:\p` is an NTFS junction → `C:\workspace\remindme` (confirmed via `fsutil reparsepoint query`, matching inode with the real repo's files).
- `C:\n` is an NTFS junction → `C:\workspace\remindme\node_modules`.
- `C:\g` is a real directory, a Gradle cache (`.tmp`, `caches`, `daemon`, `jdks`, `kotlin-profile`) — legitimate, do not touch.
- `C:\m`, `C:\r`, `C:\w` are real standalone directories, NOT junctions, each containing what looks like another full repo copy (`.claude`, `artifacts`, `.android`, etc.) — purpose/ownership unconfirmed, left untouched.

IMPLICATION: **`C:\p` already gives a short-path alias to this exact repo** — likely set up by a prior session/user specifically to work around the CMake/Ninja Windows long-path bug (see entry below). Building from `C:\p\artifacts\mobile` (junction) should get the same path-length benefit as physically copying the repo to `C:\dev\remindme`, without duplicating the checkout or needing a separate `pnpm install`.
FIX FOR NEXT TIME: try building from `C:\p\artifacts\mobile` first before copying the repo elsewhere. Only fall back to a physical copy + separate pnpm store if the junction alone isn't short enough.

**Do not delete C:\p, C:\n, C:\g, C:\m, C:\r, C:\w without explicit user confirmation per-folder** — p/n are load-bearing junctions to this repo, and m/r/w are unidentified but structurally look like other real project copies (found via git status showing meaningful uncommitted work in at least one of them).

---

## 2026-08-02/03 — Local Android build on Windows: confirmed working end-to-end

**Outcome:** after fixes #1 and #2 below, `npx expo run:android` completed with `BUILD SUCCESSFUL`, APK installed, and `com.reminders/.MainActivity` was confirmed as the foreground focused activity on the Pixel 10 emulator via `adb shell dumpsys window | grep mCurrentFocus`. The local-build path is fully validated, not just theoretically fixed.

**One extra transient failure encountered along the way (not a real bug, no fix needed):** after the native build succeeded the first time, Metro failed to bundle with `Unable to resolve "expo-router/entry" from "artifacts\mobile\index.ts"` — looked like Metro's projectRoot got confused (import stack showed paths resolving as if relative to repo root instead of `artifacts/mobile`). `metro.config.js` and the `expo-router` symlink were both verified correct. Simply re-running `npx expo run:android` from the correct cwd fixed it on the next attempt (build was mostly cached, finished in 24s). Conclusion: if you hit `expo-router/entry` unresolved right after a successful native build, just retry before assuming a real config problem.

**Process note — background task interruption:** a background build task can show status "stopped" with "No completion record found" if the Claude Code process/session ends while it's still running (not a build failure). Always check the task's `.output` log file directly for actual progress/result before assuming the build failed — in this case the log showed `BUILD SUCCESSFUL` had already happened before the interruption.

---

## 2026-08-02 — Local Android build on Windows: fixed three separate blockers

**PARTIALLY SUPERSEDED by the 2026-08-03 "CMake/Ninja Windows fix ... was INCOMPLETE" entry above** — item #2's fix below (CMake pin in `app/build.gradle` only) is necessary but not sufficient; see that entry for the complete fix covering all native modules, not just `:app`.

**Context:** user wanted `npx expo run:android` to work locally (avoid burning EAS free-tier build quota). Hit three unrelated failures in sequence. All three must be fixed together for a clean Windows build.

1. **JDK version.** System `java` on PATH was JDK 26. RN/Kotlin Gradle plugin does not support it — fails with misleading error `Error resolving plugin [id: 'com.facebook.react.settings'] > 26.0.2` (that "26.0.2" is the Java version, not a plugin version — Kotlin's `JavaVersion.parse` chokes on it).
   FIX: set `JAVA_HOME` to Android Studio's bundled JBR (`C:\Program Files\Android\Android Studio\jbr`, JDK 21) before running any gradle/expo build command.

2. **CMake/Ninja Windows long-path bug.** AGP defaults to CMake 3.22.1, which bundles Ninja 1.10. Ninja 1.10 has a real bug in Windows long-path handling, fixed only in Ninja 1.12+ (see ninja-build/ninja#1900). Windows registry `LongPathsEnabled=1` does NOT fix this — it's Ninja's own internal 260-char check, unrelated to the OS long-path opt-in.
   Symptom: build runs for minutes, gets deep into native module compilation, then fails with `ninja: error: Stat(...): Filename longer than 260 characters` or `manifest 'build.ninja' still dirty after 100 tries`, usually on modules with long file trees (react-native-keyboard-controller, react-native-worklets, expo-modules-core).
   FIX: install newer CMake (4.1.2 used here) via Android Studio SDK Manager, then explicitly pin it in `artifacts/mobile/android/app/build.gradle`:
   ```
   android { externalNativeBuild { cmake { version "4.1.2" } } }
   ```
   IMPORTANT: setting the `CMAKE_VERSION` env var alone is NOT enough — some individual native modules (e.g. react-native-worklets) read `CMAKE_VERSION` from their own `android/build.gradle`, but the top-level `:app` module does NOT read this env var and silently keeps using CMake 3.22.1 unless the version is set explicitly in `app/build.gradle` as above.
   `android/` is prebuild-generated — this edit may be wiped by a future `expo prebuild` and need reapplying.
   After any CMake version change, delete stale build caches or old absolute paths / broken ninja manifests persist and cause confusing failures: delete `android/app/.cxx`, `android/app/build`, `android/build`, `android/.gradle`.

3. **pnpm store path nesting.** Not a root cause on its own, but pnpm's `.pnpm/<pkg>@<version>_<hash>/node_modules/<pkg>` layout adds ~40-60 extra characters versus npm/yarn's flatter layout. This can tip a marginal path over Ninja's 260-char limit when the underlying Ninja bug (see #2) is present. Once CMake/Ninja is upgraded past 1.12, this stops mattering — do not try to "fix" pnpm nesting as a primary solution; it is a red herring if #2 isn't fixed first.
   (We tried relocating the pnpm virtual-store-dir to a short path `C:/ps` via `.npmrc` `virtual-store-dir=C:/ps` as a workaround before finding the real fix in #2 — this bought some headroom but did not fully solve it. Not necessary once CMake is upgraded.)

**Correct order of operations for a clean Windows local build:** fix JDK (#1) → fix CMake/Ninja version (#2) → delete stale `.cxx`/`build` caches → run `npx expo run:android`.

**Do NOT conclude pnpm itself is broken or unsupported on Windows** — this was raised and correctly pushed back on. The actual bug is in the bundled Ninja version, which affects npm/yarn users too; pnpm just makes marginal cases fail slightly more often.
