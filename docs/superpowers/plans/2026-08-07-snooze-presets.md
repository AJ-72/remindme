# Snooze Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user choose a snooze duration (5/15/30/60 min or "tomorrow same time") from a bottom sheet, with their last choice persisted and reflected on the notification-tray button.

**Architecture:** A pure `resolveSnoozeTarget()` function computes the target `Date` from a `SnoozePreset`; every snooze path (in-app sheet, notification tray) routes through it, so they cannot drift apart. The preset persists via AsyncStorage following the existing `dictationLanguage` pattern. `scheduleSnoozeNotification` and `snoozeReminder` change from computing their own delay to accepting a target `Date`.

**Tech Stack:** React Native / Expo, TypeScript, AsyncStorage, expo-notifications, Jest + @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-08-07-snooze-presets-design.md`

## Global Constraints

- **`SNOOZE_ACTION_ID` keeps its value `"SNOOZE_10"`.** Never change the string. It is embedded in the `categoryIdentifier` of notifications already scheduled on users' devices. See `system_learnings.md` 2026-08-07 and backlog item 17.
- **`SNOOZE_MINUTES` is deleted entirely** — from `ReminderService.ts`, from the `RemindersContext.tsx` re-export, and from all three test files that assert against it. No dead exports.
- **The `Reminder` interface is unchanged.** No new field, no migration.
- **Never ignore a failing test.** Fix the code and make it green. Do not dismiss a failure as pre-existing, flaky, or out of scope without genuine fix effort.
- Existing tests are **extended, not deleted**, where behavior legitimately changed.
- `ALARM_EARLY_OFFSET_MS` subtraction behavior is unchanged throughout.
- Tests run from `artifacts/mobile`: `npx jest <path>`. Typecheck from repo root: `pnpm run typecheck`.
- Baseline before starting: **202 mobile tests passing.**

## File Structure

**Create:**
- `artifacts/mobile/utils/snoozePresets.ts` — `SnoozePreset` type, preset list, `resolveSnoozeTarget()`, label helpers. Pure, no I/O, no React.
- `artifacts/mobile/utils/snoozePresets.test.ts`
- `artifacts/mobile/components/SnoozeSheet.tsx` — the picker sheet, modeled on `ConfirmSheet.tsx`.
- `artifacts/mobile/components/SnoozeSheet.test.tsx`

**Modify:**
- `artifacts/mobile/services/ReminderService.ts` — remove `SNOOZE_MINUTES`; add preset persistence; `scheduleSnoozeNotification`/`snoozeReminder` take a target `Date`; `setupSnoozeCategory` takes a preset.
- `artifacts/mobile/services/notificationResponseHandler.ts` — resolve via preset instead of a fixed delay.
- `artifacts/mobile/contexts/RemindersContext.tsx` — drop the `SNOOZE_MINUTES` re-export; expose `snoozePreset`/`setSnoozePreset`; `snoozeReminder` takes a preset.
- `artifacts/mobile/app/reminder-detail.tsx` — Snooze button opens the sheet.
- Tests: `services/ReminderService.test.ts`, `services/notificationResponseHandler.test.ts`, `__tests__/screens/reminder-detail.test.tsx`, `contexts/RemindersContext.test.tsx`.

**Why `snoozePresets.ts` is its own file:** the type and resolution logic are imported by the service, the handler, the context, and the sheet. Putting them in `ReminderService.ts` would make the pure logic untestable without the AsyncStorage/expo-notifications mock setup that file's tests require.

---

### Task 1: Pure preset types and resolution logic

**Files:**
- Create: `artifacts/mobile/utils/snoozePresets.ts`
- Test: `artifacts/mobile/utils/snoozePresets.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type SnoozePreset = { kind: "minutes"; minutes: 5 | 15 | 30 | 60 } | { kind: "tomorrow" }`
  - `const SNOOZE_PRESETS: readonly SnoozePreset[]`
  - `const DEFAULT_SNOOZE_PRESET: SnoozePreset`
  - `function resolveSnoozeTarget(preset: SnoozePreset, reminderDatetime: string, now: Date): Date`
  - `function snoozePresetLabel(preset: SnoozePreset): string`
  - `function snoozeActionLabel(preset: SnoozePreset): string`
  - `function isSnoozePreset(value: unknown): value is SnoozePreset`

- [ ] **Step 1: Write the failing test**

Create `artifacts/mobile/utils/snoozePresets.test.ts`:

```ts
import {
  DEFAULT_SNOOZE_PRESET,
  SNOOZE_PRESETS,
  isSnoozePreset,
  resolveSnoozeTarget,
  snoozeActionLabel,
  snoozePresetLabel,
  type SnoozePreset,
} from "@/utils/snoozePresets";

const NOW = new Date("2026-08-07T10:00:00");

describe("SNOOZE_PRESETS", () => {
  it("offers the five agreed presets in order", () => {
    expect(SNOOZE_PRESETS).toEqual([
      { kind: "minutes", minutes: 5 },
      { kind: "minutes", minutes: 15 },
      { kind: "minutes", minutes: 30 },
      { kind: "minutes", minutes: 60 },
      { kind: "tomorrow" },
    ]);
  });

  it("defaults to 15 minutes", () => {
    expect(DEFAULT_SNOOZE_PRESET).toEqual({ kind: "minutes", minutes: 15 });
  });
});

describe("resolveSnoozeTarget — minutes presets", () => {
  it("adds the minutes to now, ignoring the reminder's own datetime", () => {
    // The reminder fired an hour ago; a minutes-snooze is always from NOW.
    const past = new Date("2026-08-07T09:00:00").toISOString();
    const target = resolveSnoozeTarget({ kind: "minutes", minutes: 15 }, past, NOW);
    expect(target.getTime()).toBe(NOW.getTime() + 15 * 60 * 1000);
  });

  it("handles the 60-minute preset", () => {
    const target = resolveSnoozeTarget(
      { kind: "minutes", minutes: 60 },
      NOW.toISOString(),
      NOW
    );
    expect(target.getTime()).toBe(NOW.getTime() + 60 * 60 * 1000);
  });
});

describe("resolveSnoozeTarget — tomorrow preset", () => {
  it("adds 24h to the reminder's datetime, not to now", () => {
    // Reminder was set for 08:30; snoozing at 10:00 must land on 08:30 tomorrow.
    const scheduled = new Date("2026-08-07T08:30:00").toISOString();
    const target = resolveSnoozeTarget({ kind: "tomorrow" }, scheduled, NOW);
    expect(target.toISOString()).toBe(new Date("2026-08-08T08:30:00").toISOString());
  });

  it("rolls forward past a stale reminder so the target is always in the future", () => {
    // Reminder is 3 days stale: +24h would still be in the past and would
    // fire immediately. Roll forward in whole days to preserve "same time".
    const stale = new Date("2026-08-04T08:30:00").toISOString();
    const target = resolveSnoozeTarget({ kind: "tomorrow" }, stale, NOW);
    expect(target.getTime()).toBeGreaterThan(NOW.getTime());
    expect(target.toISOString()).toBe(new Date("2026-08-08T08:30:00").toISOString());
  });

  it("rolls forward when the target lands exactly on now", () => {
    const exactly24hAgo = new Date("2026-08-06T10:00:00").toISOString();
    const target = resolveSnoozeTarget({ kind: "tomorrow" }, exactly24hAgo, NOW);
    expect(target.getTime()).toBeGreaterThan(NOW.getTime());
    expect(target.toISOString()).toBe(new Date("2026-08-08T10:00:00").toISOString());
  });

  it("handles a future reminder datetime without rolling forward", () => {
    const future = new Date("2026-08-07T18:00:00").toISOString();
    const target = resolveSnoozeTarget({ kind: "tomorrow" }, future, NOW);
    expect(target.toISOString()).toBe(new Date("2026-08-08T18:00:00").toISOString());
  });

  it("falls back to a 24h-from-now target for an unparseable datetime", () => {
    const target = resolveSnoozeTarget({ kind: "tomorrow" }, "not-a-date", NOW);
    expect(target.getTime()).toBe(NOW.getTime() + 24 * 60 * 60 * 1000);
  });
});

describe("labels", () => {
  it("labels minutes presets for the sheet", () => {
    expect(snoozePresetLabel({ kind: "minutes", minutes: 5 })).toBe("5 minutes");
    expect(snoozePresetLabel({ kind: "minutes", minutes: 60 })).toBe("1 hour");
  });

  it("labels the tomorrow preset for the sheet", () => {
    expect(snoozePresetLabel({ kind: "tomorrow" })).toBe("Tomorrow, same time");
  });

  it("labels presets for the notification action button", () => {
    expect(snoozeActionLabel({ kind: "minutes", minutes: 15 })).toBe("Snooze 15 min");
    expect(snoozeActionLabel({ kind: "minutes", minutes: 60 })).toBe("Snooze 1 hr");
    expect(snoozeActionLabel({ kind: "tomorrow" })).toBe("Snooze to tomorrow");
  });
});

describe("isSnoozePreset", () => {
  it("accepts valid presets", () => {
    expect(isSnoozePreset({ kind: "minutes", minutes: 30 })).toBe(true);
    expect(isSnoozePreset({ kind: "tomorrow" })).toBe(true);
  });

  it("rejects malformed or unknown values", () => {
    expect(isSnoozePreset(null)).toBe(false);
    expect(isSnoozePreset({ kind: "minutes" })).toBe(false);
    expect(isSnoozePreset({ kind: "minutes", minutes: 7 })).toBe(false);
    expect(isSnoozePreset({ kind: "weekly" })).toBe(false);
    expect(isSnoozePreset("10")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `artifacts/mobile`: `npx jest utils/snoozePresets.test.ts`
Expected: FAIL — cannot resolve module `@/utils/snoozePresets`.

- [ ] **Step 3: Write the implementation**

Create `artifacts/mobile/utils/snoozePresets.ts`:

```ts
/**
 * Snooze durations the user can pick. A discriminated union rather than a
 * plain minute count because "tomorrow same time" is not a fixed delay: every
 * minutes preset is measured from *now*, while "tomorrow" is +24h from the
 * reminder's own scheduled time, and those differ (the user snoozes at an
 * arbitrary moment, not exactly at fire time).
 */
export type SnoozePreset =
  | { kind: "minutes"; minutes: 5 | 15 | 30 | 60 }
  | { kind: "tomorrow" };

export const SNOOZE_PRESETS: readonly SnoozePreset[] = [
  { kind: "minutes", minutes: 5 },
  { kind: "minutes", minutes: 15 },
  { kind: "minutes", minutes: 30 },
  { kind: "minutes", minutes: 60 },
  { kind: "tomorrow" },
];

export const DEFAULT_SNOOZE_PRESET: SnoozePreset = { kind: "minutes", minutes: 15 };

const DAY_MS = 24 * 60 * 60 * 1000;

export function isSnoozePreset(value: unknown): value is SnoozePreset {
  if (!value || typeof value !== "object") return false;
  const v = value as { kind?: unknown; minutes?: unknown };
  if (v.kind === "tomorrow") return true;
  if (v.kind !== "minutes") return false;
  return v.minutes === 5 || v.minutes === 15 || v.minutes === 30 || v.minutes === 60;
}

/**
 * The single place a snooze target is computed. Both the in-app sheet and the
 * notification-tray action route through this, which is what keeps them from
 * drifting apart.
 */
export function resolveSnoozeTarget(
  preset: SnoozePreset,
  reminderDatetime: string,
  now: Date
): Date {
  if (preset.kind === "minutes") {
    return new Date(now.getTime() + preset.minutes * 60 * 1000);
  }

  const scheduled = new Date(reminderDatetime).getTime();
  if (Number.isNaN(scheduled)) {
    return new Date(now.getTime() + DAY_MS);
  }

  // Roll forward in whole days so a stale reminder still lands at the same
  // clock time rather than firing immediately (a target <= now would be
  // delivered by expo-notifications straight away).
  let target = scheduled + DAY_MS;
  while (target <= now.getTime()) {
    target += DAY_MS;
  }
  return new Date(target);
}

export function snoozePresetLabel(preset: SnoozePreset): string {
  if (preset.kind === "tomorrow") return "Tomorrow, same time";
  if (preset.minutes === 60) return "1 hour";
  return `${preset.minutes} minutes`;
}

/** Label for the notification-tray action button, which has less room. */
export function snoozeActionLabel(preset: SnoozePreset): string {
  if (preset.kind === "tomorrow") return "Snooze to tomorrow";
  if (preset.minutes === 60) return "Snooze 1 hr";
  return `Snooze ${preset.minutes} min`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest utils/snoozePresets.test.ts`
Expected: PASS, all tests green.

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/utils/snoozePresets.ts artifacts/mobile/utils/snoozePresets.test.ts
git commit -m "feat(mobile): add snooze preset types and target resolution"
```

---

### Task 2: Persist the snooze preset in ReminderService

**Files:**
- Modify: `artifacts/mobile/services/ReminderService.ts`
- Test: `artifacts/mobile/services/ReminderService.test.ts`

**Interfaces:**
- Consumes: `SnoozePreset`, `DEFAULT_SNOOZE_PRESET`, `isSnoozePreset` from Task 1.
- Produces: `SNOOZE_PRESET_KEY`, `getSnoozePreset(): Promise<SnoozePreset>`, `setSnoozePreset(p: SnoozePreset): Promise<void>`.

This task only adds persistence. `SNOOZE_MINUTES` removal happens in Task 3, where its call sites change.

- [ ] **Step 1: Write the failing test**

Append to `artifacts/mobile/services/ReminderService.test.ts`. Add `SNOOZE_PRESET_KEY`, `getSnoozePreset`, `setSnoozePreset` to the existing import block from `@/services/ReminderService`, then append:

```ts
describe("snooze preset persistence", () => {
  it("defaults to 15 minutes when nothing is stored", async () => {
    expect(await getSnoozePreset()).toEqual({ kind: "minutes", minutes: 15 });
  });

  it("round-trips a minutes preset", async () => {
    await setSnoozePreset({ kind: "minutes", minutes: 30 });
    expect(await getSnoozePreset()).toEqual({ kind: "minutes", minutes: 30 });
  });

  it("round-trips the tomorrow preset", async () => {
    await setSnoozePreset({ kind: "tomorrow" });
    expect(await getSnoozePreset()).toEqual({ kind: "tomorrow" });
  });

  it("falls back to the default when the stored value is corrupt", async () => {
    await AsyncStorage.setItem(SNOOZE_PRESET_KEY, "not json{");
    expect(await getSnoozePreset()).toEqual({ kind: "minutes", minutes: 15 });
  });

  it("falls back to the default when the stored value is valid JSON but not a preset", async () => {
    await AsyncStorage.setItem(SNOOZE_PRESET_KEY, JSON.stringify({ kind: "yearly" }));
    expect(await getSnoozePreset()).toEqual({ kind: "minutes", minutes: 15 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest services/ReminderService.test.ts -t "snooze preset persistence"`
Expected: FAIL — `getSnoozePreset is not a function`.

- [ ] **Step 3: Write the implementation**

In `ReminderService.ts`, add the import near the top:

```ts
import {
  DEFAULT_SNOOZE_PRESET,
  isSnoozePreset,
  type SnoozePreset,
} from "@/utils/snoozePresets";
```

Add the key beside the other storage keys (near line 18):

```ts
export const SNOOZE_PRESET_KEY = "@snooze_preset_v1";
```

Re-export the type so consumers can import it from the service alongside everything else:

```ts
export type { SnoozePreset };
```

Add the accessors next to `getDictationLanguage`/`setDictationLanguage`:

```ts
export async function getSnoozePreset(): Promise<SnoozePreset> {
  try {
    const raw = await AsyncStorage.getItem(SNOOZE_PRESET_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // A corrupt or outdated stored value must not be able to wedge snoozing.
      if (isSnoozePreset(parsed)) return parsed;
    }
  } catch {}
  return DEFAULT_SNOOZE_PRESET;
}

export async function setSnoozePreset(preset: SnoozePreset): Promise<void> {
  await AsyncStorage.setItem(SNOOZE_PRESET_KEY, JSON.stringify(preset));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest services/ReminderService.test.ts`
Expected: PASS — the new describe block green, all pre-existing tests in the file still green.

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/services/ReminderService.ts artifacts/mobile/services/ReminderService.test.ts
git commit -m "feat(mobile): persist the user's snooze preset"
```

---

### Task 3: Route service scheduling through a target date; delete SNOOZE_MINUTES

**Files:**
- Modify: `artifacts/mobile/services/ReminderService.ts`
- Modify: `artifacts/mobile/contexts/RemindersContext.tsx` (re-export removal only)
- Test: `artifacts/mobile/services/ReminderService.test.ts`

**Interfaces:**
- Consumes: `resolveSnoozeTarget`, `SnoozePreset` (Task 1); `getSnoozePreset` (Task 2).
- Produces:
  - `scheduleSnoozeNotification(data: NotificationData, target: Date): Promise<string | undefined>`
  - `snoozeReminder(current: Reminder[], id: string, preset: SnoozePreset): Promise<Reminder[]>`
  - `setupSnoozeCategory(preset: SnoozePreset): Promise<void>`
  - `SNOOZE_MINUTES` **no longer exists.**

- [ ] **Step 1: Update the existing tests to the new signatures**

These are the three assertions that used `SNOOZE_MINUTES` as their expected value. Rewriting them is the point of the task — they must assert against an explicit target, not a deleted constant.

In `services/ReminderService.test.ts`:

Remove `SNOOZE_MINUTES` from the import block. Add `getSnoozePreset` if not already imported from Task 2, and add at the top of the file:

```ts
import { resolveSnoozeTarget } from "@/utils/snoozePresets";
```

Replace the `scheduleSnoozeNotification` test (currently at ~line 241) with:

```ts
  it("scheduleSnoozeNotification schedules at the given target minus the early offset", async () => {
    const target = new Date(Date.now() + 30 * 60 * 1000);
    const data: NotificationData = {
      reminderId: "r1",
      title: "Snoozed",
      body: "body",
      alarm: true,
      channelId: "reminders-alarm",
    };
    await scheduleSnoozeNotification(data, target);

    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const call = (scheduleNotificationAsync as jest.Mock).mock.calls[0][0];
    expect(call.trigger.date.getTime()).toBe(
      target.getTime() - ALARM_EARLY_OFFSET_MS
    );
  });
```

Replace the `snoozeReminder respects the setting too` test (~line 304) body's call with a preset argument:

```ts
    await snoozeReminder([r], "r1", { kind: "minutes", minutes: 15 });
```

Replace the whole `describe("snoozeReminder", ...)` block (~line 569) with:

```ts
describe("snoozeReminder", () => {
  it("cancels the old notification, schedules a new one, and updates datetime+notificationId", async () => {
    const r = makeReminder({ id: "r1", notificationId: "old-notif" });
    const preset = { kind: "minutes", minutes: 15 } as const;
    const before = Date.now();

    const result = await snoozeReminder([r], "r1", preset);

    const after = Date.now();
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith("old-notif");
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);

    const updated = result.find((x) => x.id === "r1")!;
    expect(updated.notificationId).toBe("mock-notif-id");
    const updatedMs = new Date(updated.datetime).getTime();
    const snoozeMs = 15 * 60 * 1000;
    expect(updatedMs).toBeGreaterThanOrEqual(before + snoozeMs);
    expect(updatedMs).toBeLessThanOrEqual(after + snoozeMs);
  });

  it("uses the reminder's own datetime for the tomorrow preset", async () => {
    const scheduled = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const r = makeReminder({
      id: "r1",
      notificationId: "old-notif",
      datetime: scheduled.toISOString(),
    });

    const result = await snoozeReminder([r], "r1", { kind: "tomorrow" });

    const updated = result.find((x) => x.id === "r1")!;
    expect(new Date(updated.datetime).getTime()).toBe(
      scheduled.getTime() + 24 * 60 * 60 * 1000
    );
  });

  it("returns the list unchanged for an unknown id", async () => {
    const r = makeReminder({ id: "r1" });
    const result = await snoozeReminder([r], "unknown-id", {
      kind: "minutes",
      minutes: 15,
    });
    expect(result).toEqual([r]);
  });
});
```

Also add a test that the category label follows the preset. Find the existing test asserting `SNOOZE_ACTION_ID` in the category setup (~line 525) and add after it:

```ts
  it("labels the snooze action from the given preset", async () => {
    await setupSnoozeCategory({ kind: "tomorrow" });
    const actions = (setNotificationCategoryAsync as jest.Mock).mock.calls.at(-1)![1];
    const snoozeAction = actions.find(
      (a: { identifier: string }) => a.identifier === SNOOZE_ACTION_ID
    );
    expect(snoozeAction.buttonTitle).toBe("Snooze to tomorrow");
  });
```

> If `setupSnoozeCategory` is not currently exported, export it as part of Step 2. If `setNotificationCategoryAsync` is not already imported in the test file's expo-notifications mock destructuring, add it.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest services/ReminderService.test.ts`
Expected: FAIL — `SNOOZE_MINUTES` import unresolved and/or the new target/preset arguments ignored by the old signatures.

- [ ] **Step 3: Write the implementation**

In `ReminderService.ts`:

Add to the Task 2 import from `@/utils/snoozePresets`: `resolveSnoozeTarget`, `snoozeActionLabel`.

**Delete** the line `export const SNOOZE_MINUTES = 10;` (line 22).

Add a comment above `SNOOZE_ACTION_ID` recording why its value is frozen:

```ts
// NOTE: the value must stay "SNOOZE_10" even though snooze is now
// user-configurable. It is written into the categoryIdentifier of every
// scheduled notification, so notifications already sitting in a user's tray
// across an upgrade carry this exact string — changing it makes their Snooze
// button silently do nothing. Renaming needs a dual-registration migration
// (backlog item 17).
export const SNOOZE_ACTION_ID = "SNOOZE_10";
```

Change `setupSnoozeCategory` to take a preset and use it for the label (and export it):

```ts
export async function setupSnoozeCategory(preset: SnoozePreset): Promise<void> {
  if (Platform.OS === "web" || !Notifications) return;
  try {
    await Notifications.setNotificationCategoryAsync(SNOOZE_CATEGORY_ID, [
      {
        identifier: SNOOZE_ACTION_ID,
        buttonTitle: snoozeActionLabel(preset),
        options: {
          isDestructive: false,
          isAuthenticationRequired: false,
        },
      },
      // ... MARK_DONE_ACTION_ID entry unchanged ...
    ]);
  } catch {}
}
```

Update its caller inside `requestNotificationPermissions` (line ~199) to read the stored preset:

```ts
      await setupNotificationChannel();
      await setupSnoozeCategory(await getSnoozePreset());
```

Change `scheduleSnoozeNotification` to accept the target:

```ts
export async function scheduleSnoozeNotification(
  data: NotificationData,
  target: Date
): Promise<string | undefined> {
  if (Platform.OS === "web" || !Notifications) return undefined;
  try {
    const snoozeDate = new Date(target.getTime() - ALARM_EARLY_OFFSET_MS);
    // ... rest of the body unchanged, still using snoozeDate ...
```

Change `snoozeReminder` to take a preset and resolve through the shared function:

```ts
export async function snoozeReminder(
  current: Reminder[],
  id: string,
  preset: SnoozePreset
): Promise<Reminder[]> {
  const target = current.find((r) => r.id === id);
  if (!target) return current;
  await cancelNotification(target.notificationId);
  const alarmOn = target.alarm !== false;
  const body = await resolveNotificationBody(target.description);
  const snoozeTarget = resolveSnoozeTarget(preset, target.datetime, new Date());
  const notificationId = await scheduleSnoozeNotification(
    {
      reminderId: id,
      title: target.title,
      body,
      alarm: alarmOn,
      channelId: channelIdForAlarm(alarmOn),
    },
    snoozeTarget
  );
  const datetime = snoozeTarget.toISOString();
  const reminders = current.map((r) =>
    r.id === id ? { ...r, datetime, notificationId } : r
  );
  await saveReminders(reminders);
  return reminders;
}
```

In `contexts/RemindersContext.tsx`, remove `SNOOZE_MINUTES,` from the re-export block (line 34). Nothing imports it from here — verify with:

```bash
grep -rn "SNOOZE_MINUTES" artifacts/mobile
```

Only `notificationResponseHandler.ts` and its test should remain; those are Task 4.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest services/ReminderService.test.ts`
Expected: PASS. `notificationResponseHandler.test.ts` will still be red — that is Task 4.

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/services/ReminderService.ts artifacts/mobile/services/ReminderService.test.ts artifacts/mobile/contexts/RemindersContext.tsx
git commit -m "feat(mobile): schedule snoozes from a resolved target date"
```

---

### Task 4: Notification-tray handler resolves through the preset

**Files:**
- Modify: `artifacts/mobile/services/notificationResponseHandler.ts`
- Modify: `artifacts/mobile/components/NotificationResponseHandler.tsx`
- Test: `artifacts/mobile/services/notificationResponseHandler.test.ts`

**Interfaces:**
- Consumes: `resolveSnoozeTarget` (Task 1), `getSnoozePreset` (Task 2), `scheduleSnoozeNotification(data, target)` (Task 3).
- Produces: `NotificationResponseHandlerDeps` gains `getSnoozePreset: () => Promise<SnoozePreset>` and `loadReminderById: (id: string) => Promise<Reminder | undefined>`; `scheduleSnoozeNotification` dep gains its `target` parameter.

The handler needs the reminder's `datetime` for the "tomorrow" preset, and only has `data.reminderId` — hence the new lookup dep.

- [ ] **Step 1: Write the failing test**

In `services/notificationResponseHandler.test.ts`, remove `SNOOZE_MINUTES` from the import block and extend `makeDeps`:

```ts
function makeDeps() {
  return {
    defaultActionIdentifier: DEFAULT_ACTION_IDENTIFIER,
    lastHandledId: { current: null as string | null },
    markDoneById: jest.fn().mockResolvedValue(undefined),
    scheduleSnoozeNotification: jest.fn().mockResolvedValue("new-notif"),
    updateSnoozeById: jest.fn().mockResolvedValue(undefined),
    navigateToDetail: jest.fn(),
    getSnoozePreset: jest
      .fn()
      .mockResolvedValue({ kind: "minutes", minutes: 15 } as const),
    loadReminderById: jest.fn().mockResolvedValue({
      id: "r1",
      title: "T",
      description: "",
      datetime: new Date("2026-08-07T08:30:00").toISOString(),
      completed: false,
    }),
  };
}
```

Replace the existing snooze test with:

```ts
  it("schedules a snooze at the preset's target and persists it, without navigating", async () => {
    const deps = makeDeps();
    const data = {
      reminderId: "r1",
      title: "T",
      body: "B",
      alarm: true,
      channelId: "reminders-alarm",
    };
    const before = Date.now();
    await handleNotificationResponse(makeResponse(SNOOZE_ACTION_ID, { data }), deps);
    const after = Date.now();

    expect(deps.navigateToDetail).not.toHaveBeenCalled();

    const [, target] = deps.scheduleSnoozeNotification.mock.calls[0];
    const snoozeMs = 15 * 60 * 1000;
    expect(target.getTime()).toBeGreaterThanOrEqual(before + snoozeMs);
    expect(target.getTime()).toBeLessThanOrEqual(after + snoozeMs);

    const [id, datetime, notificationId] = deps.updateSnoozeById.mock.calls[0];
    expect(id).toBe("r1");
    expect(notificationId).toBe("new-notif");
    // The persisted datetime must match the scheduled target exactly.
    expect(datetime).toBe(target.toISOString());
  });

  it("uses the reminder's own datetime for the tomorrow preset", async () => {
    const deps = makeDeps();
    deps.getSnoozePreset.mockResolvedValue({ kind: "tomorrow" } as const);
    const scheduled = new Date(Date.now() + 2 * 60 * 60 * 1000);
    deps.loadReminderById.mockResolvedValue({
      id: "r1",
      title: "T",
      description: "",
      datetime: scheduled.toISOString(),
      completed: false,
    });
    const data = {
      reminderId: "r1",
      title: "T",
      body: "B",
      alarm: true,
      channelId: "reminders-alarm",
    };

    await handleNotificationResponse(makeResponse(SNOOZE_ACTION_ID, { data }), deps);

    const [, target] = deps.scheduleSnoozeNotification.mock.calls[0];
    expect(target.getTime()).toBe(scheduled.getTime() + 24 * 60 * 60 * 1000);
  });

  it("still snoozes by the minutes preset when the reminder can't be loaded", async () => {
    const deps = makeDeps();
    deps.loadReminderById.mockResolvedValue(undefined);
    const data = {
      reminderId: "r1",
      title: "T",
      body: "B",
      alarm: true,
      channelId: "reminders-alarm",
    };
    const before = Date.now();

    await handleNotificationResponse(makeResponse(SNOOZE_ACTION_ID, { data }), deps);

    const [, target] = deps.scheduleSnoozeNotification.mock.calls[0];
    expect(target.getTime()).toBeGreaterThanOrEqual(before + 15 * 60 * 1000);
  });
```

Also update the two tests asserting `scheduleSnoozeNotification` was *not* called — they need no change, they only assert absence.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest services/notificationResponseHandler.test.ts`
Expected: FAIL — `SNOOZE_MINUTES` unresolved; `scheduleSnoozeNotification` called with one argument.

- [ ] **Step 3: Write the implementation**

Rewrite the snooze branch in `services/notificationResponseHandler.ts`:

```ts
import {
  MARK_DONE_ACTION_ID,
  SNOOZE_ACTION_ID,
  type NotificationData,
  type Reminder,
} from "@/services/ReminderService";
import { resolveSnoozeTarget, type SnoozePreset } from "@/utils/snoozePresets";
```

Extend the deps interface:

```ts
export interface NotificationResponseHandlerDeps {
  defaultActionIdentifier: string;
  lastHandledId: { current: string | null };
  markDoneById: (id: string) => Promise<void>;
  scheduleSnoozeNotification: (
    data: NotificationData,
    target: Date
  ) => Promise<string | undefined>;
  updateSnoozeById: (
    id: string,
    datetime: string,
    notificationId: string | undefined
  ) => Promise<void>;
  navigateToDetail: (id: string) => void;
  getSnoozePreset: () => Promise<SnoozePreset>;
  loadReminderById: (id: string) => Promise<Reminder | undefined>;
}
```

Replace the snooze branch:

```ts
  if (response.actionIdentifier === SNOOZE_ACTION_ID) {
    const preset = await deps.getSnoozePreset();
    // "tomorrow" needs the reminder's own scheduled time, which the
    // notification payload doesn't carry — look it up. Falling back to now
    // keeps a minutes-preset snooze working even if the lookup fails.
    const reminder = await deps.loadReminderById(data.reminderId);
    const base = reminder?.datetime ?? new Date().toISOString();
    const target = resolveSnoozeTarget(preset, base, new Date());
    const notificationId = await deps.scheduleSnoozeNotification(data, target);
    await deps.updateSnoozeById(data.reminderId, target.toISOString(), notificationId);
    return;
  }
```

In `components/NotificationResponseHandler.tsx`, add the two new deps to the object passed to `handleNotificationResponse`:

```ts
      getSnoozePreset,
      loadReminderById,
```

importing `getSnoozePreset` from `@/services/ReminderService`. If `loadReminderById` does not exist in the service, add it there beside `markDoneById`:

```ts
export async function loadReminderById(id: string): Promise<Reminder | undefined> {
  const reminders = await loadReminders();
  return reminders.find((r) => r.id === id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest services/notificationResponseHandler.test.ts services/ReminderService.test.ts`
Expected: PASS both files.

Confirm the constant is fully gone:
```bash
grep -rn "SNOOZE_MINUTES" artifacts/mobile
```
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/services/notificationResponseHandler.ts artifacts/mobile/services/notificationResponseHandler.test.ts artifacts/mobile/components/NotificationResponseHandler.tsx artifacts/mobile/services/ReminderService.ts
git commit -m "feat(mobile): resolve tray-action snoozes through the stored preset"
```

---

### Task 5: Context exposes the preset and re-registers the category

**Files:**
- Modify: `artifacts/mobile/contexts/RemindersContext.tsx`
- Test: `artifacts/mobile/contexts/RemindersContext.test.tsx`

**Interfaces:**
- Consumes: `getSnoozePreset`/`setSnoozePreset` (Task 2), `snoozeReminder(current, id, preset)` and `setupSnoozeCategory(preset)` (Task 3).
- Produces: context gains `snoozePreset: SnoozePreset` and `setSnoozePreset: (p: SnoozePreset) => Promise<void>`; `snoozeReminder` becomes `(id: string, preset?: SnoozePreset) => Promise<void>` — omitting the preset uses the stored default.

- [ ] **Step 1: Write the failing test**

In `contexts/RemindersContext.test.tsx`, add to the test harness component a control that sets the preset and one that snoozes with an explicit preset, following the file's existing pattern of `Text testID=... onPress=...` probes. Then add:

```ts
  it("exposes the stored snooze preset and defaults to 15 minutes", async () => {
    const { findByTestId } = renderHarness();
    await waitFor(async () =>
      expect((await findByTestId("snooze-preset")).props.children).toBe(
        '{"kind":"minutes","minutes":15}'
      )
    );
  });

  it("setSnoozePreset persists the choice and updates the exposed value", async () => {
    const { findByTestId } = renderHarness();
    fireEvent.press(await findByTestId("set-preset-tomorrow"));

    await waitFor(async () =>
      expect((await findByTestId("snooze-preset")).props.children).toBe(
        '{"kind":"tomorrow"}'
      )
    );
    expect(await AsyncStorage.getItem(SNOOZE_PRESET_KEY)).toBe('{"kind":"tomorrow"}');
  });

  it("snoozeReminder with an explicit preset uses it rather than the default", async () => {
    const scheduled = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([makeReminder({ id: "r1", datetime: scheduled.toISOString() })])
    );
    const { findByTestId } = renderHarness();
    fireEvent.press(await findByTestId("snooze-r1-tomorrow"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
      expect(new Date(stored[0].datetime).getTime()).toBe(
        scheduled.getTime() + 24 * 60 * 60 * 1000
      );
    });
  });
```

Update the existing `snoozeReminder updates the reminder's datetime and notificationId in storage` test (line ~235) if it asserts a 10-minute delta — change the expectation to 15 minutes (the new default).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest contexts/RemindersContext.test.tsx`
Expected: FAIL — `snoozePreset` undefined on the context.

- [ ] **Step 3: Write the implementation**

In `RemindersContext.tsx`:

Add imports: `getSnoozePreset`, `setSnoozePreset as serviceSetSnoozePreset`, `setupSnoozeCategory` from the service; `DEFAULT_SNOOZE_PRESET`, `type SnoozePreset` from `@/utils/snoozePresets`. Re-export `SnoozePreset` alongside the other types.

Add to the context interface:

```ts
  snoozeReminder: (id: string, preset?: SnoozePreset) => Promise<void>;
  snoozePreset: SnoozePreset;
  setSnoozePreset: (preset: SnoozePreset) => Promise<void>;
```

Add state and load it in the existing `Promise.all` bootstrap:

```ts
  const [snoozePreset, setSnoozePresetState] =
    useState<SnoozePreset>(DEFAULT_SNOOZE_PRESET);
```

Add `getSnoozePreset()` to the `Promise.all` array and destructure it alongside the others, then `setSnoozePresetState(preset)`.

Add the setter, which also re-registers the tray category so its button label follows:

```ts
  const setSnoozePreset = useCallback(async (preset: SnoozePreset) => {
    await serviceSetSnoozePreset(preset);
    setSnoozePresetState(preset);
    // Re-register so the notification-tray button label matches. Fire-and-
    // forget by design: setupSnoozeCategory swallows its own errors, and a
    // stale label is cosmetic — the action ID and handler still work.
    setupSnoozeCategory(preset);
  }, []);
```

Update `snoozeReminder`:

```ts
  const snoozeReminder = useCallback(
    async (id: string, preset?: SnoozePreset) => {
      const updated = await serviceSnooze(reminders, id, preset ?? snoozePreset);
      setReminders(updated);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [reminders, snoozePreset]
  );
```

Add `snoozePreset` and `setSnoozePreset` to the provider's `value` object.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest contexts/RemindersContext.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/contexts/RemindersContext.tsx artifacts/mobile/contexts/RemindersContext.test.tsx
git commit -m "feat(mobile): expose the snooze preset through RemindersContext"
```

---

### Task 6: The SnoozeSheet component

**Files:**
- Create: `artifacts/mobile/components/SnoozeSheet.tsx`
- Test: `artifacts/mobile/components/SnoozeSheet.test.tsx`

**Interfaces:**
- Consumes: `SNOOZE_PRESETS`, `snoozePresetLabel`, `type SnoozePreset` (Task 1).
- Produces: `<SnoozeSheet visible current onSelect onCancel />` where `onSelect: (preset: SnoozePreset) => void | Promise<void>`.

The component is presentational — it does not persist or snooze. The screen wires those up (Task 7), which keeps this testable without provider setup.

- [ ] **Step 1: Write the failing test**

Create `artifacts/mobile/components/SnoozeSheet.test.tsx`:

```tsx
import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import SnoozeSheet from "@/components/SnoozeSheet";

describe("SnoozeSheet", () => {
  it("renders all five presets", () => {
    const { getByText } = render(
      <SnoozeSheet
        visible
        current={{ kind: "minutes", minutes: 15 }}
        onSelect={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(getByText("5 minutes")).toBeTruthy();
    expect(getByText("15 minutes")).toBeTruthy();
    expect(getByText("30 minutes")).toBeTruthy();
    expect(getByText("1 hour")).toBeTruthy();
    expect(getByText("Tomorrow, same time")).toBeTruthy();
  });

  it("marks the current preset as selected for accessibility", () => {
    const { getByTestId } = render(
      <SnoozeSheet
        visible
        current={{ kind: "minutes", minutes: 30 }}
        onSelect={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(getByTestId("snooze-option-30").props.accessibilityState.selected).toBe(true);
    expect(getByTestId("snooze-option-15").props.accessibilityState.selected).toBe(false);
  });

  it("marks the tomorrow option as selected when it is current", () => {
    const { getByTestId } = render(
      <SnoozeSheet
        visible
        current={{ kind: "tomorrow" }}
        onSelect={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(getByTestId("snooze-option-tomorrow").props.accessibilityState.selected).toBe(
      true
    );
  });

  it("calls onSelect with the chosen preset", () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <SnoozeSheet
        visible
        current={{ kind: "minutes", minutes: 15 }}
        onSelect={onSelect}
        onCancel={jest.fn()}
      />
    );
    fireEvent.press(getByTestId("snooze-option-60"));
    expect(onSelect).toHaveBeenCalledWith({ kind: "minutes", minutes: 60 });
  });

  it("calls onSelect with the tomorrow preset", () => {
    const onSelect = jest.fn();
    const { getByTestId } = render(
      <SnoozeSheet
        visible
        current={{ kind: "minutes", minutes: 15 }}
        onSelect={onSelect}
        onCancel={jest.fn()}
      />
    );
    fireEvent.press(getByTestId("snooze-option-tomorrow"));
    expect(onSelect).toHaveBeenCalledWith({ kind: "tomorrow" });
  });

  it("calls onCancel from the cancel button", () => {
    const onCancel = jest.fn();
    const { getByTestId } = render(
      <SnoozeSheet
        visible
        current={{ kind: "minutes", minutes: 15 }}
        onSelect={jest.fn()}
        onCancel={onCancel}
      />
    );
    fireEvent.press(getByTestId("snooze-sheet-cancel"));
    expect(onCancel).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest components/SnoozeSheet.test.tsx`
Expected: FAIL — cannot resolve `@/components/SnoozeSheet`.

- [ ] **Step 3: Write the implementation**

Create `artifacts/mobile/components/SnoozeSheet.tsx`, following `ConfirmSheet.tsx`'s structure (same `Modal`, overlay `Pressable`, handle, `useColors()`):

```tsx
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import {
  SNOOZE_PRESETS,
  snoozePresetLabel,
  type SnoozePreset,
} from "@/utils/snoozePresets";

interface Props {
  visible: boolean;
  current: SnoozePreset;
  onSelect: (preset: SnoozePreset) => void | Promise<void>;
  onCancel: () => void;
}

function testIdFor(preset: SnoozePreset): string {
  return preset.kind === "tomorrow"
    ? "snooze-option-tomorrow"
    : `snooze-option-${preset.minutes}`;
}

function isSame(a: SnoozePreset, b: SnoozePreset): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "tomorrow" || b.kind === "tomorrow") return true;
  return a.minutes === b.minutes;
}

export default function SnoozeSheet({ visible, current, onSelect, onCancel }: Props) {
  const colors = useColors();

  const styles = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 24,
      paddingTop: 20,
      paddingBottom: Platform.OS === "ios" ? 40 : 28,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      alignSelf: "center",
      marginBottom: 16,
    },
    title: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 12,
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    optionLabel: {
      flex: 1,
      fontSize: 15,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    cancelBtn: {
      marginTop: 16,
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: colors.muted,
      alignItems: "center",
    },
    cancelText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel} testID="snooze-sheet-overlay">
        <Pressable onPress={() => {}} style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Snooze until…</Text>
          {SNOOZE_PRESETS.map((preset) => {
            const selected = isSame(preset, current);
            return (
              <Pressable
                key={testIdFor(preset)}
                testID={testIdFor(preset)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={styles.option}
                onPress={() => onSelect(preset)}
              >
                <Text style={styles.optionLabel}>{snoozePresetLabel(preset)}</Text>
                {selected && <Feather name="check" size={18} color={colors.primary} />}
              </Pressable>
            );
          })}
          <Pressable
            style={styles.cancelBtn}
            onPress={onCancel}
            testID="snooze-sheet-cancel"
          >
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest components/SnoozeSheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/components/SnoozeSheet.tsx artifacts/mobile/components/SnoozeSheet.test.tsx
git commit -m "feat(mobile): add the snooze duration picker sheet"
```

---

### Task 7: Wire the sheet into the reminder detail screen

**Files:**
- Modify: `artifacts/mobile/app/reminder-detail.tsx`
- Test: `artifacts/mobile/__tests__/screens/reminder-detail.test.tsx`

**Interfaces:**
- Consumes: `SnoozeSheet` (Task 6); `snoozePreset`, `setSnoozePreset`, `snoozeReminder(id, preset)` from context (Task 5).
- Produces: no new exports.

Selecting a preset does two things: snoozes with it, and persists it as the new default.

- [ ] **Step 1: Extend the existing snooze test**

In `__tests__/screens/reminder-detail.test.tsx`, replace the `Snooze reschedules…` test. It previously asserted that pressing the button changed storage; the button now opens the sheet, so the test presses through to a preset:

```tsx
  it("Snooze opens the preset sheet without rescheduling yet", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId, findByText } = renderScreen();

    fireEvent.press(await findByTestId("snooze-button"));

    expect(await findByText("Snooze until…")).toBeTruthy();
    expect(mockBack).not.toHaveBeenCalled();
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].datetime).toBe(FUTURE);
  });

  it("choosing a preset reschedules the reminder and navigates back", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId } = renderScreen();

    fireEvent.press(await findByTestId("snooze-button"));
    await act(async () => {
      fireEvent.press(await findByTestId("snooze-option-30"));
    });

    await waitFor(() => expect(mockBack).toHaveBeenCalled(), { timeout: 5000 });
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].datetime).not.toBe(FUTURE);
    expect(stored[0].notificationId).toBe("mock-notif-id");
    const expected = Date.now() + 30 * 60 * 1000;
    expect(Math.abs(new Date(stored[0].datetime).getTime() - expected)).toBeLessThan(5000);
  });

  it("choosing a preset persists it as the new default", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId } = renderScreen();

    fireEvent.press(await findByTestId("snooze-button"));
    await act(async () => {
      fireEvent.press(await findByTestId("snooze-option-tomorrow"));
    });

    await waitFor(async () =>
      expect(await AsyncStorage.getItem(SNOOZE_PRESET_KEY)).toBe('{"kind":"tomorrow"}')
    );
  });

  it("cancelling the snooze sheet leaves the reminder untouched", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([makeReminder()]));
    const { findByTestId } = renderScreen();

    fireEvent.press(await findByTestId("snooze-button"));
    fireEvent.press(await findByTestId("snooze-sheet-cancel"));

    expect(mockBack).not.toHaveBeenCalled();
    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) as string);
    expect(stored[0].datetime).toBe(FUTURE);
  });
```

Add `SNOOZE_PRESET_KEY` to the import from `@/services/ReminderService`.

> Note the `act(async () => ...)` wrapper on the presses that trigger an async snooze — the same pattern the delete-confirm tests in this file use, and for the same reason (see `system_learnings.md` 2026-08-06 on the fire-and-forget race).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/screens/reminder-detail.test.tsx`
Expected: FAIL — no element with text "Snooze until…"; pressing `snooze-button` still snoozes directly.

- [ ] **Step 3: Write the implementation**

In `app/reminder-detail.tsx`:

Import the sheet and pull the preset from context:

```tsx
import SnoozeSheet from "@/components/SnoozeSheet";
import type { SnoozePreset } from "@/utils/snoozePresets";
```

```tsx
  const {
    reminders,
    loading,
    toggleComplete,
    snoozeReminder,
    deleteReminder,
    snoozePreset,
    setSnoozePreset,
  } = useReminders();
  const [snoozeSheetVisible, setSnoozeSheetVisible] = useState(false);
```

Replace `handleSnooze` and add the selection handler:

```tsx
  const handleSnooze = () => {
    setSnoozeSheetVisible(true);
  };

  const handleSelectSnoozePreset = async (preset: SnoozePreset) => {
    setSnoozeSheetVisible(false);
    // The chosen preset becomes the new default, so the notification-tray
    // button converges on whatever the user actually uses.
    await setSnoozePreset(preset);
    await snoozeReminder(id, preset);
    goBack();
  };
```

Change the button label (line ~240) from `Snooze 10 min` to `Snooze`.

Render the sheet next to the existing `ConfirmSheet`:

```tsx
      <SnoozeSheet
        visible={snoozeSheetVisible}
        current={snoozePreset}
        onSelect={handleSelectSnoozePreset}
        onCancel={() => setSnoozeSheetVisible(false)}
      />
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/screens/reminder-detail.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add artifacts/mobile/app/reminder-detail.tsx artifacts/mobile/__tests__/screens/reminder-detail.test.tsx
git commit -m "feat(mobile): pick a snooze duration from the reminder detail screen"
```

---

## Verification

1. **Full mobile suite green.** From `artifacts/mobile`: `npx jest`.
   Baseline was 202 passing; expect 202 + roughly 30 new, with **zero failures**. A failure here is not "pre-existing" — root-cause and fix it.
2. **`SNOOZE_MINUTES` is fully gone:** `grep -rn "SNOOZE_MINUTES" artifacts/mobile` returns no matches.
3. **`SNOOZE_ACTION_ID` is untouched:** `grep -rn 'SNOOZE_ACTION_ID = ' artifacts/mobile` still shows `"SNOOZE_10"`.
4. **Typecheck clean** from repo root: `pnpm run typecheck` — exit code 0.
5. **Manual smoke on device/emulator:**

   | Action | Expect |
   |---|---|
   | Open a reminder → Snooze | Sheet lists 5/15/30/60 min + Tomorrow, with 15 checked |
   | Pick "30 minutes" | Reminder moves 30 min out, returns to list |
   | Reopen the sheet | 30 minutes now shows the check |
   | Pull down the notification tray on a fired reminder | Snooze button reads "Snooze 30 min" |
   | Tap that tray Snooze button | Reminder moves 30 min out; notification dismisses |
   | Pick "Tomorrow, same time" on a reminder set for 08:30 | Reminder moves to 08:30 the next day |
   | Tray button after choosing Tomorrow | Reads "Snooze to tomorrow" |

   **Known risk to watch for in step 5:** Android may not update an
   already-registered notification category's button label. If the tray label
   stays stale, the new label may only apply to notifications scheduled after
   the change. This cannot be verified in Jest. If it reproduces, note it in
   `system_learnings.md` and add a backlog item — do not block the feature on
   it, since the action ID and handler still work correctly under a stale label.

6. **Ledger:** add a `system_learnings.md` entry only if something non-obvious
   surfaced during implementation (e.g. the Android category-label behavior
   above). The `SNOOZE_ACTION_ID` freeze is already recorded.
