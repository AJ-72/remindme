---
date: 2026-07-20T16:31:51
git_commit: 056c6dcbeb517e12c49203c747eefa0e7c37707e
branch: main
repository: remindme
topic: "Notification-tap reminder-detail screen — implementation plan authoring"
tags: [handoff, session-transition, mobile, expo-notifications, expo-router, writing-plans]
status: in_progress
last_updated: 2026-07-20
type: implementation_handoff
---

# Handoff: Write the implementation plan for the notification-detail feature

## 0. Executive Summary (TL;DR)

1. I was writing an implementation plan (via the `superpowers:writing-plans` skill) for the approved, judge-reviewed design spec at `docs/superpowers/specs/2026-07-20-notification-tap-detail-screen-design.md`, which adds a reminder-detail screen reached by tapping a fired notification, plus headless-safe Mark Done/Snooze tray actions.
2. I stopped after finishing all codebase reconnaissance (verified exact mock shapes, expo-notifications API signatures, and test conventions) but **before writing any part of the plan document itself** — no plan file exists yet.
3. The single most important next action: write `docs/superpowers/plans/2026-07-20-notification-detail-screen.md` following the `writing-plans` skill's template, using the verified facts in §3 and §6 of this handoff so no re-research is needed.

## 1. Technical State

**Active Working Set** (files the plan will need to create/modify):
- `artifacts/mobile/services/ReminderService.ts:26-41` — `Reminder` and `SnoozeData` interfaces; `SnoozeData` → `NotificationData` rename + `reminderId` field goes here.
- `artifacts/mobile/services/ReminderService.ts:149-223` — `scheduleNotification` / `scheduleSnoozeNotification`; both need `reminderId` threaded through `content.data`.
- `artifacts/mobile/services/ReminderService.ts:290-352` — `addReminder` (id generated **after** `scheduleNotification` at line 294-300, must reorder so id exists before scheduling), `editReminder`, `deleteReminder`, `toggleComplete`. New functions `markDoneById` and `updateSnoozeById`/snooze-persistence logic go near these, following the `rescheduleAllFutureReminders` (lines 354-377) pattern of reading/writing AsyncStorage directly without going through context.
- `artifacts/mobile/services/ReminderService.ts:121-135` — `setupSnoozeCategory`; needs a second action `MARK_DONE_ACTION_ID = "MARK_DONE"` registered alongside existing `SNOOZE_ACTION_ID = "SNOOZE_10"`.
- `artifacts/mobile/contexts/RemindersContext.tsx:31-137` — add `snoozeReminder(id)` method; re-exports of service symbols live here (lines 24-29) — the new notification-response handler component must import service functions directly (not through these re-exports) to keep the import direction one-way (`contexts` → `services`, never reverse), per spec.
- `artifacts/mobile/app/_layout.tsx:36-43,124-145` — current notification-response listener only handles `SNOOZE_ACTION_ID`, lives at `RootLayout` level (no context access), and never checks `getLastNotificationResponseAsync()` so cold-start taps are missed entirely. This whole block needs to move into a component mounted inside `<RemindersProvider>` (see spec's "Notification response handling" section) and register `Stack.Screen name="reminder-detail"` in the `<Stack>` at lines 49-60.
- `artifacts/mobile/app/reminder-detail.tsx` — **new file**, doesn't exist yet. Follow `artifacts/mobile/app/add-reminder.tsx` modal conventions exactly (header/close-button pattern at lines 385-398, `insets`-aware styles, `useColors()`).
- `artifacts/mobile/components/ReminderCard.tsx:16-32` — `formatDatetime` lives only here; extract to `artifacts/mobile/utils/formatDatetime.ts` (new file — no `utils/` dir exists yet, confirmed via `find`).
- `artifacts/mobile/__tests__/screens/reminder-detail.test.tsx` — **new test file**, follow the exact harness pattern in `artifacts/mobile/__tests__/screens/index.test.tsx` and `settings.test.tsx` (both read in full this session).

**Current Errors / Blockers:** None — no code changes have been made yet, only research and one interrupted plan-authoring attempt.

**Environment:**
- Uncommitted changes: none tracked. Untracked (pre-existing, not part of this work, do not touch/commit without asking): `.claude/`, `.playwright-mcp/`, `backlog.md` (user's personal feature-idea list, created 2026-07-20 15:47, one hour before this session's spec work — unrelated), `handoffs/` (this file).
- `docs/superpowers/plans/` exists already (contains an unrelated prior plan `2026-07-19-mobile-testing.md`) — it is **not** newly created, already tracked in a prior commit or otherwise present; just add the new plan file into it.
- No ENV vars needed for plan-writing. For later manual verification of the feature (per spec, cold-start notification testing is manual-only), a real Android/iOS device will be needed — not available in this environment.
- No running processes/background jobs.
- pnpm is not on PATH directly in this shell; the working shim was found at `/private/tmp/pnpm-shim/pnpm` — prepend to PATH: `export PATH="/private/tmp/pnpm-shim:$PATH"` before running `pnpm --filter mobile test` or `pnpm --filter mobile run typecheck`.

## 2. Progress Tracker

| Task | Status | Location | Notes |
|------|--------|----------|-------|
| Explore reminder/notification flow | ✅ Complete | (research only) | Done via Explore agent earlier in session |
| Brainstorm UX flow, actions, edge cases | ✅ Complete | — | User approved dedicated detail screen, Mark Done+Snooze+Edit+Delete, "already handled" message, list-tap-unchanged |
| Write design spec | ✅ Complete | `docs/superpowers/specs/2026-07-20-notification-tap-detail-screen-design.md` | Committed at `278a9cc` |
| design-spec-judge review | ✅ Complete | — | Found 2 critical/major bugs (cold-start Mark Done race, snooze orphan) + minor issues |
| Resolve judge findings with user | ✅ Complete | — | User chose: keep headless Mark Done via AsyncStorage path; persist snooze (update datetime+notificationId) |
| Revise spec with fixes | ✅ Complete | `docs/superpowers/specs/2026-07-20-notification-tap-detail-screen-design.md` | Committed at `056c6dc` (current HEAD) |
| Codebase recon for plan-writing | ✅ Complete | see §3, §6 below | Verified exact mock shapes, API signatures, test patterns |
| **Write implementation plan** | ❌ **Not started** | `docs/superpowers/plans/2026-07-20-notification-detail-screen.md` (does not exist yet) | **This is the next action** |
| Execute plan (subagent-driven or inline) | ⏳ Pending | — | Depends on plan being written first |

## 3. Mental Model (Most Critical Section)

**Why the current approach was chosen:**

The feature closes a real UX gap: tapping a fired reminder notification currently does nothing (app just opens to last-active screen). The design went through three rounds: (1) interactive brainstorming with the user settled the UX (dedicated detail screen, not a highlighted-list-scroll; four actions Mark Done/Snooze/Edit/Delete; explicit "already handled" message; leave the home list's card-tap-to-edit behavior alone), (2) a `design-spec-judge` agent review caught that the interactively-approved technical design had two real headless/cold-start bugs the brainstorming missed, (3) the user resolved those two open questions by choosing the more robust (headless-safe) option both times. This is now saved as a project-level lesson in memory (`design-review-catches-coldstart-bugs.md`) — **any future notification/background-task feature in this app should get a judge-style adversarial pass before implementation, even after interactive UX approval**, because headless-execution correctness is a different concern than UX flow correctness and the interactive process doesn't surface it.

**Codebase Gotchas Discovered This Session (verified, not assumed):**
- `artifacts/mobile/services/ReminderService.ts:294-300` — `addReminder` generates the reminder's `id` **after** calling `scheduleNotification`, so today's `content.data` payload cannot include `reminderId`. The plan must reorder this: generate `id` first, then pass it into `scheduleNotification`.
- `Notifications.DEFAULT_ACTION_IDENTIFIER` is real and confirmed to exist: `artifacts/mobile/node_modules/expo-notifications/build/NotificationsEmitter.js:11` — `export const DEFAULT_ACTION_IDENTIFIER = 'expo.modules.notifications.actions.DEFAULT';`. Used to distinguish a body-tap from an action-button tap in `response.actionIdentifier`.
- `Notifications.getLastNotificationResponseAsync()` is real (`artifacts/mobile/node_modules/expo-notifications/build/NotificationsEmitter.d.ts:75`) and there's also a **deprecated non-async** sibling `getLastNotificationResponse()` plus `clearLastNotificationResponseAsync()` / `clearLastNotificationResponse()` (lines 83-105 of the same file). The design spec's plan to dedup via a manually-tracked "last handled identifier" is one valid approach, but **`clearLastNotificationResponseAsync()` may be a cleaner alternative** worth considering in the plan — it exists precisely to prevent re-handling the same cached response across remounts. Not yet decided which to use; the plan author should pick one and justify it (module-level dedup guard is simpler and more testable; `clearLastNotificationResponseAsync` is more "native" but its interaction with `getLastNotificationResponseAsync` on iOS vs Android isn't verified in this session).
- `router.canGoBack()` exists in this expo-router version (confirmed: `artifacts/mobile/node_modules/expo-router/build/imperative-api.d.ts:29`), needed for the detail screen's back-navigation fallback per spec.
- `NotificationAction.options.opensAppToForeground` defaults to `true` (confirmed: `artifacts/mobile/node_modules/expo-notifications/build/Notifications.types.d.ts:660`) — meaning the new `MARK_DONE_ACTION_ID` tray button will foreground the app by default unless explicitly set `opensAppToForeground: false`. **The spec assumes Mark Done from the tray works without opening the app** — if the plan wants that literal behavior (no foreground/UI flash), it must explicitly set `opensAppToForeground: false` on that action's options when calling `setNotificationCategoryAsync`. This wasn't caught by the design-spec-judge review and is a new finding from this session's recon — **flag this explicitly in the plan's Mark Done task**.
- Test mocking conventions (all verified by reading real files, not assumed):
  - `artifacts/mobile/__mocks__/expo-notifications.ts` — Jest auto-mock via the `__mocks__/` directory convention (no `jest.mock("expo-notifications")` call needed anywhere in test files — confirmed via grep, zero matches). Currently exports: `scheduleNotificationAsync`, `cancelScheduledNotificationAsync`, `requestPermissionsAsync`, `getPermissionsAsync`, `setNotificationChannelAsync`, `deleteNotificationChannelAsync`, `setNotificationCategoryAsync`, `setNotificationHandler`, `AndroidImportance`, `AndroidNotificationVisibility`, `SchedulableTriggerInputTypes`. **Must add**: `DEFAULT_ACTION_IDENTIFIER` (string constant, just re-declare the literal `'expo.modules.notifications.actions.DEFAULT'`), `getLastNotificationResponseAsync` (jest.fn, default resolve `null`), `addNotificationResponseReceivedListener` (jest.fn returning `{ remove: jest.fn() }`), and per the new finding above, likely `clearLastNotificationResponseAsync` too if that approach is chosen for dedup.
  - `expo-router` is mocked inline per-test-file via `jest.mock("expo-router", () => ({ router: { push: jest.fn() }, ... }))` — see `artifacts/mobile/__tests__/screens/index.test.tsx:12-14`. The new `reminder-detail.test.tsx` will need a similar inline mock, extended with `useLocalSearchParams` (settings.test.tsx doesn't use it, but `add-reminder.tsx:80` does — no existing test mocks `useLocalSearchParams` yet, this will be a first).
  - `AppState` is mocked by React Native's own jest preset at `node_modules/react-native/jest/mocks/AppState.js` — `addEventListener` returns `{ remove: jest.fn() }`, `currentState` is a bare `jest.fn()` with no default value set. Relevant only if the plan's cold-start handling interacts with `AppState` (the existing `_layout.tsx:110-122` `AppState` listener is for the *separate* exact-alarm-permission banner, unrelated to notification-response handling — don't conflate the two).
  - `Haptics` mocked via `jest.mock("expo-haptics")` (auto-mock, no manual `__mocks__` file — Jest's built-in automock since it's a simple module) at the top of every screen/context test file that touches haptics.

**Dead Ends — Do Not Repeat These:**
| Approach Tried | Why It Failed | Evidence |
|---------------|---------------|----------|
| (none yet) | — | No implementation attempted this session — only spec-writing and recon |

**Key Decisions Made (already locked in via the approved+revised spec — do not re-litigate with the user):**
| Decision | Rationale | Alternative Rejected |
|----------|-----------|---------------------|
| Dedicated `reminder-detail.tsx` modal screen | User explicitly preferred over scroll-to-highlighted-card in home list | Highlighting the card in the list |
| Actions: Mark Done, Snooze, Edit, Delete | User's explicit choice among 3 offered options | Just Mark Done + Snooze |
| Tray keeps existing Snooze AND gets new Mark Done button | User chose "both" when asked | Removing tray snooze; only adding tray Mark Done |
| Home list card-tap behavior unchanged (still → edit) | User explicitly rejected unifying it with the new detail screen | Routing list taps through detail screen too |
| "Already handled" explicit message (not silent redirect) | User's explicit choice | Silent redirect to home list |
| Tray Mark Done uses AsyncStorage-direct path (`markDoneById`), not React context | Judge review found context-based approach would silently no-op on cold start (empty `reminders` array); user confirmed to keep the feature and pay the complexity cost | Dropping the tray Mark Done button entirely (user explicitly declined this simpler option) |
| Snooze persists new `datetime`+`notificationId` to the stored reminder | Judge review found the non-persisting approach orphans the original notification (delete/edit would cancel the wrong one); user confirmed | Leaving snooze as notification-only, tray-parity behavior (documented tradeoff, user declined) |

**Assumptions in Play:**
- The plan assumes `jest-expo`'s automock resolution picks up `artifacts/mobile/__mocks__/expo-notifications.ts` without any explicit `jest.mock()` call in test files — verified true by grep (zero explicit calls exist, yet the existing `ReminderService.test.ts` and `RemindersContext.test.tsx` both successfully import and assert against the mocked functions). If this breaks, check `jest.config.js:1` (`preset: "jest-expo"`) — the preset's default `roots`/`modulePaths` config is what makes `__mocks__/` at the mobile package root work.
- The plan assumes no native rebuild is needed for this feature (pure JS/TS notification-category and routing changes) — consistent with the spec's explicit non-goal "No changes to Android channel/permission setup." If `setNotificationCategoryAsync` behaves differently after adding a second action in a way that needs a fresh native build to pick up (unlikely, categories are set at JS runtime, not baked into the native build), that assumption would need revisiting — not expected to be an issue based on how `setupSnoozeCategory` already works today.

## 4. Delta — Changes Made This Session

All changes are committed — see git log above (`278a9cc`, `056c6dc`). No uncommitted changes exist. The only uncommitted artifact from this session is this handoff file itself, plus the pre-existing unrelated untracked files noted in §1 (`backlog.md`, `.claude/`, `.playwright-mcp/`) which were **not** created or modified by this session's work and should not be swept up into any future commit related to this feature.

## 5. Next Steps (Ordered — Do Not Skip Steps)

1. **Verify state** (confirm the spec is exactly as expected before planning against it):
   ```bash
   git show 056c6dc:docs/superpowers/specs/2026-07-20-notification-tap-detail-screen-design.md | head -5
   ```
   Expected output: starts with `# Notification tap → reminder detail screen`.

2. **Immediate action**: Re-invoke the `superpowers:writing-plans` skill and write `docs/superpowers/plans/2026-07-20-notification-detail-screen.md`. Use the spec at `docs/superpowers/specs/2026-07-20-notification-tap-detail-screen-design.md` (current, revised version — read it fresh, don't rely on memory of it) as the source of truth for scope, and use §3/§6 of this handoff for the verified technical facts (exact API names, mock file contents, existing test patterns) so no re-research is needed. Decide the dedup approach (module-level tracked identifier vs. `clearLastNotificationResponseAsync`) and the `opensAppToForeground: false` question (both flagged as new findings in §3) as part of writing the plan — these are implementation details within the already-approved spec's scope, not new user-facing decisions requiring another AskUserQuestion round.
   - Location for the new screen: `artifacts/mobile/app/reminder-detail.tsx`
   - Location for service changes: `artifacts/mobile/services/ReminderService.ts`
   - Location for context changes: `artifacts/mobile/contexts/RemindersContext.tsx`
   - Location for layout/routing changes: `artifacts/mobile/app/_layout.tsx`

3. **Then**: Run the plan's self-review checklist (spec coverage, placeholder scan, type consistency) as specified by the `writing-plans` skill before presenting it.

4. **Verification**: Once the plan is written, offer the user the execution choice (Subagent-Driven vs Inline) per the `writing-plans` skill's required handoff step — do not start implementing without that explicit choice.

5. **Watch for**: When tasks are executed, run `pnpm --filter mobile test` and `pnpm --filter mobile run typecheck` after each task (prepend `export PATH="/private/tmp/pnpm-shim:$PATH"` first, since `pnpm` is not on the default PATH in this environment — confirmed working shim location this session).

## 6. Artifacts & References

- **Design doc**: `docs/superpowers/specs/2026-07-20-notification-tap-detail-screen-design.md` (committed, current at HEAD `056c6dc`)
- **New files created this session**: none yet (plan not written); this handoff file; one new memory file at `/Users/Anand.Nair/.claude/projects/-Users-Anand-Nair-workspace-remindme/memory/design-review-catches-coldstart-bugs.md`
- **Key existing files read in full this session** (contents verified, safe to reference without re-reading): `artifacts/mobile/services/ReminderService.ts`, `artifacts/mobile/contexts/RemindersContext.tsx`, `artifacts/mobile/app/_layout.tsx`, `artifacts/mobile/app/add-reminder.tsx`, `artifacts/mobile/app/(tabs)/index.tsx` (now the home screen, moved there in prior session — see commit `26690c4`), `artifacts/mobile/components/ReminderCard.tsx`, `artifacts/mobile/services/ReminderService.test.ts`, `artifacts/mobile/contexts/RemindersContext.test.tsx`, `artifacts/mobile/tasks/rescheduleTask.ts`, `artifacts/mobile/__mocks__/expo-notifications.ts`, `artifacts/mobile/hooks/useColors.ts`, `artifacts/mobile/constants/colors.ts`, `artifacts/mobile/tsconfig.json`.
- **External API surface verified this session** (in `artifacts/mobile/node_modules/expo-notifications/build/`): `Notifications.types.d.ts` (NotificationAction, NotificationResponse, NotificationRequest shapes), `NotificationsEmitter.d.ts` (getLastNotificationResponseAsync, clearLastNotificationResponseAsync, DEFAULT_ACTION_IDENTIFIER).
- **Related prior work**: `docs/superpowers/plans/2026-07-19-mobile-testing.md` (unrelated pre-existing plan, do not confuse with this feature's plan).
