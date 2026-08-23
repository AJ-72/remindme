# Smart Alerts Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the four independently-shippable foundations of Smart Alerts — corrupt-store hardening, reminder instrumentation, user-owned quiet hours, and vague-task detection — plus the in-app explainer of the research.

**Architecture:** All new decision logic lives in pure, dependency-free utils that take an injected `now`, mirroring `utils/snoozePresets.ts`; screens and services consume them. Persistence stays on AsyncStorage (see the spec's "Persistence" section for why not SQLite). Every new `Reminder` field is optional so existing records stay valid without migration.

**Tech Stack:** React Native / Expo (Expo Router), TypeScript, AsyncStorage, Jest + `@testing-library/react-native`, pnpm workspace.

**Spec:** `docs/superpowers/specs/2026-08-23-smart-alerts-design.md`

## Global Constraints

- **Run all commands from `artifacts/mobile/`** unless stated otherwise. Tests: `npx jest <path>`. Typecheck: `npx tsc -p tsconfig.json --noEmit`. Full workspace typecheck: `pnpm run typecheck` from the repo root.
- **Package manager is pnpm only.** The root `preinstall` hook rejects npm and yarn.
- **No new npm dependencies in this plan.** Everything uses packages already installed.
- **Every commit message ends with the trailer:** `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **No surface may compute or display a completion rate, score, streak, or any aggregate readable as a grade.** This is a hard product constraint from the spec, not a styling preference.
- **Copy discipline:** all user-facing strings name the observation, never the user's character. No "you", no counts, no "you've snoozed this 4 times".
- **Malayalam:** user-entered content renders through `getFontFamily` (`utils/getFontFamily.ts`). `MALAYALAM_RANGE` is exported from `utils/parseNaturalLanguage.ts` — import it, never redefine it.
- **Provider nesting in tests:** any test rendering `SharedTextProvider` must wrap it *inside* `RemindersProvider`. Getting this backwards throws `"useReminders must be used within RemindersProvider"`. This bug has recurred in three separate test files.
- **`nudgesSent` and `checkInSent` are deliberately NOT in this plan.** They are written only by the re-nudge scheduler, which is Plan B. Adding unwritten fields now would be dead weight.

---

### Task 1: Harden the corrupt-store path

`loadReminders` currently catches a JSON parse failure and returns `[]`. The app then renders an empty list, and the next write persists that empty array over the user's real data — unrecoverable, since AsyncStorage is the only copy. This is a prerequisite for everything else: the instrumentation makes each record more valuable, so the loss gets worse.

The fix quarantines the unreadable payload under a timestamped key before returning `[]`, so a later overwrite cannot destroy it.

**Files:**
- Modify: `artifacts/mobile/services/ReminderService.ts` (`loadReminders`, around line 107)
- Test: `artifacts/mobile/services/ReminderService.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `QUARANTINE_KEY_PREFIX: string`, and `loadReminders(): Promise<Reminder[]>` (unchanged signature — every existing caller keeps working).

- [ ] **Step 1: Write the failing test**

Add to `artifacts/mobile/services/ReminderService.test.ts`, inside the existing top-level describe area (place it next to the other storage tests):

```ts
describe("corrupt store quarantine", () => {
  it("preserves an unreadable payload instead of letting the next write destroy it", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, "{ this is not json");

    // Reads as empty, so the UI shows an empty list rather than crashing.
    expect(await loadReminders()).toEqual([]);

    // The corrupt payload is still recoverable under a quarantine key.
    const keys = await AsyncStorage.getAllKeys();
    const quarantined = keys.filter((k) => k.startsWith(QUARANTINE_KEY_PREFIX));
    expect(quarantined).toHaveLength(1);
    expect(await AsyncStorage.getItem(quarantined[0])).toBe("{ this is not json");
  });

  it("does not quarantine an genuinely empty store", async () => {
    expect(await loadReminders()).toEqual([]);
    const keys = await AsyncStorage.getAllKeys();
    expect(keys.filter((k) => k.startsWith(QUARANTINE_KEY_PREFIX))).toHaveLength(0);
  });

  // A second failed read must not bury the first quarantine under a new one
  // keyed to the same millisecond, nor spawn unbounded copies.
  it("quarantines at most once per corrupt payload", async () => {
    await AsyncStorage.setItem(STORAGE_KEY, "{ bad");
    await loadReminders();
    await loadReminders();

    const keys = await AsyncStorage.getAllKeys();
    expect(keys.filter((k) => k.startsWith(QUARANTINE_KEY_PREFIX))).toHaveLength(1);
  });
});
```

Add `QUARANTINE_KEY_PREFIX` and `loadReminders` to the existing import block at the top of that test file (it already imports `STORAGE_KEY` and `AsyncStorage`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest services/ReminderService.test.ts -t "corrupt store quarantine"`
Expected: FAIL — `QUARANTINE_KEY_PREFIX` is not exported.

- [ ] **Step 3: Write the implementation**

In `artifacts/mobile/services/ReminderService.ts`, add the prefix next to the other storage keys (near line 29):

```ts
/**
 * Corrupt reminder payloads are copied here rather than discarded. AsyncStorage
 * holds the ONLY copy of a user's reminders - no backend, manual backup - so a
 * parse failure that returns [] would otherwise be laundered into permanent
 * data loss by the very next write.
 */
export const QUARANTINE_KEY_PREFIX = "@reminders_corrupt_";
```

Replace `loadReminders` (line 107) with:

```ts
export async function loadReminders(): Promise<Reminder[]> {
  let raw: string | null = null;
  try {
    raw = await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage itself is unavailable; there is nothing to quarantine.
    return [];
  }
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Reminder[];
  } catch {}

  // Unreadable, or readable but not an array. Preserve it before any caller
  // can overwrite the slot, then present as empty so the app still starts.
  await quarantineCorruptStore(raw);
  return [];
}

async function quarantineCorruptStore(raw: string): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    // One quarantine per corrupt payload. Re-reading the same bad value on
    // every launch must not spawn a new copy each time and fill storage.
    for (const key of keys) {
      if (!key.startsWith(QUARANTINE_KEY_PREFIX)) continue;
      if ((await AsyncStorage.getItem(key)) === raw) return;
    }
    await AsyncStorage.setItem(`${QUARANTINE_KEY_PREFIX}${Date.now()}`, raw);
  } catch {
    // Best effort. A failed quarantine must not stop the app from loading.
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest services/ReminderService.test.ts`
Expected: PASS, including all pre-existing tests in that file.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc -p tsconfig.json --noEmit
git add services/ReminderService.ts services/ReminderService.test.ts
git commit -m "fix(mobile): quarantine an unreadable reminder store instead of losing it

loadReminders turned a JSON parse failure into an empty array, and the
next write then persisted that over the user's real reminders. Storage
is the only copy - no backend, manual backup - so that path was silent,
permanent data loss. The bad payload is now copied aside first.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Reminder lifecycle instrumentation

Add the four history fields the re-nudge engine will read in Plan B. All optional; existing records are never back-filled, because there is no honest value to back-fill with.

**Files:**
- Modify: `artifacts/mobile/services/ReminderService.ts` (`Reminder` interface ~line 71; `addReminder`, `toggleComplete`, `markDoneById`, `snoozeReminder`)
- Test: `artifacts/mobile/services/ReminderService.test.ts`

**Interfaces:**
- Consumes: Task 1's hardened `loadReminders`.
- Produces: `Reminder` gains `createdAt?: string`, `completedAt?: string`, `snoozeCount?: number`, `originalDatetime?: string`. Reading convention is `snoozeCount ?? 0`.

- [ ] **Step 1: Write the failing test**

```ts
describe("reminder instrumentation", () => {
  it("stamps createdAt when a reminder is added", async () => {
    const { reminders } = await addReminder([], {
      title: "Call the plumber",
      description: "",
      datetime: new Date(Date.now() + 3600_000).toISOString(),
    });
    expect(typeof reminders[0].createdAt).toBe("string");
    expect(Number.isNaN(Date.parse(reminders[0].createdAt!))).toBe(false);
  });

  it("stamps completedAt on completion and clears it on un-completion", async () => {
    const r: Reminder = {
      id: "r1",
      title: "T",
      description: "",
      datetime: new Date(Date.now() + 3600_000).toISOString(),
      completed: false,
    };
    const done = await toggleComplete([r], "r1");
    expect(typeof done[0].completedAt).toBe("string");

    // Un-completing must clear it, or the record claims a completion time for
    // a task that is not complete.
    const undone = await toggleComplete(done, "r1");
    expect(undone[0].completed).toBe(false);
    expect(undone[0].completedAt).toBeUndefined();
  });

  it("stamps completedAt from the notification Mark Done path too", async () => {
    const r: Reminder = {
      id: "r1",
      title: "T",
      description: "",
      datetime: new Date(Date.now() + 3600_000).toISOString(),
      completed: false,
    };
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([r]));
    await markDoneById("r1");

    const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY))!);
    expect(typeof stored[0].completedAt).toBe("string");
  });

  it("counts snoozes and records the ORIGINAL datetime only once", async () => {
    const first = new Date(Date.now() + 3600_000).toISOString();
    const r: Reminder = {
      id: "r1",
      title: "T",
      description: "",
      datetime: first,
      completed: false,
    };

    const once = await snoozeReminder([r], "r1", "10m");
    expect(once[0].snoozeCount).toBe(1);
    expect(once[0].originalDatetime).toBe(first);

    const twice = await snoozeReminder(once, "r1", "10m");
    expect(twice[0].snoozeCount).toBe(2);
    // Still the FIRST intended time - this is how far the task has slid.
    expect(twice[0].originalDatetime).toBe(first);
  });
});
```

Ensure `addReminder`, `toggleComplete`, `markDoneById`, `snoozeReminder` and the `Reminder` type are in the test file's import block.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest services/ReminderService.test.ts -t "reminder instrumentation"`
Expected: FAIL — `createdAt` is `undefined`, and `snoozeCount` is `undefined`.

- [ ] **Step 3: Write the implementation**

In the `Reminder` interface (~line 71), add:

```ts
  /** When the reminder was created. Absent on records predating instrumentation. */
  createdAt?: string;
  /** When it was marked done. Cleared when un-completed. */
  completedAt?: string;
  /** Deliberate postponements. Never reset - this is the avoidance signal. */
  snoozeCount?: number;
  /**
   * The FIRST datetime this reminder ever had, set once on first snooze.
   * `datetime` is overwritten by each snooze, so without this the distance a
   * task has slid from its original intent is unrecoverable.
   */
  originalDatetime?: string;
```

In `addReminder`, add `createdAt: new Date().toISOString(),` to the object literal that builds the new reminder (alongside `completed: false`).

In `toggleComplete`, replace the mapped object with:

```ts
  const reminders = current.map((r) =>
    r.id === id
      ? {
          ...r,
          completed: !r.completed,
          notificationId: !r.completed ? undefined : r.notificationId,
          // Set on completion, cleared on un-completion: a record must never
          // claim a completion time for a task that is not complete.
          completedAt: !r.completed ? new Date().toISOString() : undefined,
        }
      : r
  );
```

In `markDoneById`, replace the mapped object with:

```ts
  const updated = reminders.map((r) =>
    r.id === id
      ? {
          ...r,
          completed: true,
          notificationId: undefined,
          completedAt: new Date().toISOString(),
        }
      : r
  );
```

In `snoozeReminder`, find where it builds the updated reminder and add both fields. The reminder being snoozed is `target`, and its pre-snooze time is `target.datetime`:

```ts
        snoozeCount: (r.snoozeCount ?? 0) + 1,
        // `??` not `||`: written once, on the first snooze only. An existing
        // value must survive every later snooze.
        originalDatetime: r.originalDatetime ?? r.datetime,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest services/ReminderService.test.ts`
Expected: PASS, all tests including pre-existing ones.

- [ ] **Step 5: Verify the backup round-trip is unaffected**

Run: `npx jest utils/reminderBackup.test.ts`
Expected: PASS. New *reminder* fields need no backup work — `parseBackup` and `mergeReminders` both spread, so unrecognised fields already survive. (New *settings* are different; Task 4 handles that.)

- [ ] **Step 6: Typecheck and commit**

```bash
npx tsc -p tsconfig.json --noEmit
git add services/ReminderService.ts services/ReminderService.test.ts
git commit -m "feat(mobile): record when reminders are made, done and postponed

Snoozing overwrote datetime in place and kept no counter, erasing the
strongest avoidance signal in the app every time it occurred.
originalDatetime is written once so the distance a task has slid stays
measurable, and snoozeCount is never reset.

All fields are optional and nothing is back-filled - there is no honest
value to back-fill with, and inventing one poisons the data.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Quiet hours pure logic

The two failure modes here are silent, so they are both pinned by tests: a window that **wraps midnight**, and `start === end` meaning "never quiet" rather than silencing every notification the app sends.

**Files:**
- Create: `artifacts/mobile/utils/quietHours.ts`
- Test: `artifacts/mobile/utils/quietHours.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface QuietHours { startMinute: number; endMinute: number }` — minutes since local midnight, 0–1439.
  - `DEFAULT_QUIET_HOURS: QuietHours` (22:00–08:00)
  - `isQuietAt(date: Date, window: QuietHours): boolean`
  - `quietHoursEndAfter(date: Date, window: QuietHours): Date`
  - `formatQuietTime(minute: number): string` → `"22:00"`
  - `minutesFromDate(date: Date): number`

- [ ] **Step 1: Write the failing test**

Create `artifacts/mobile/utils/quietHours.test.ts`:

```ts
import {
  DEFAULT_QUIET_HOURS,
  formatQuietTime,
  isQuietAt,
  minutesFromDate,
  quietHoursEndAfter,
  type QuietHours,
} from "./quietHours";

function at(hour: number, minute = 0): Date {
  return new Date(2026, 7, 23, hour, minute, 0, 0);
}

describe("isQuietAt", () => {
  // The default window wraps midnight, which is the classic off-by-one in
  // every quiet-hours implementation ever written: times AFTER start and
  // times BEFORE end are both inside it.
  it("treats a midnight-wrapping window as one continuous span", () => {
    expect(isQuietAt(at(23), DEFAULT_QUIET_HOURS)).toBe(true);
    expect(isQuietAt(at(2), DEFAULT_QUIET_HOURS)).toBe(true);
    expect(isQuietAt(at(7, 59), DEFAULT_QUIET_HOURS)).toBe(true);
    expect(isQuietAt(at(8), DEFAULT_QUIET_HOURS)).toBe(false);
    expect(isQuietAt(at(12), DEFAULT_QUIET_HOURS)).toBe(false);
    expect(isQuietAt(at(21, 59), DEFAULT_QUIET_HOURS)).toBe(false);
    expect(isQuietAt(at(22), DEFAULT_QUIET_HOURS)).toBe(true);
  });

  it("handles a same-day window that does not wrap", () => {
    const dayShift: QuietHours = { startMinute: 9 * 60, endMinute: 17 * 60 };
    expect(isQuietAt(at(8, 59), dayShift)).toBe(false);
    expect(isQuietAt(at(9), dayShift)).toBe(true);
    expect(isQuietAt(at(16, 59), dayShift)).toBe(true);
    expect(isQuietAt(at(17), dayShift)).toBe(false);
  });

  // The degenerate case. Reading it as "always quiet" would silently disable
  // every notification the app sends, with no error anywhere.
  it("treats start === end as NO quiet hours, never as always-quiet", () => {
    const none: QuietHours = { startMinute: 0, endMinute: 0 };
    expect(isQuietAt(at(0), none)).toBe(false);
    expect(isQuietAt(at(3), none)).toBe(false);
    expect(isQuietAt(at(23, 59), none)).toBe(false);
  });
});

describe("quietHoursEndAfter", () => {
  it("returns this morning's end when already inside the window after midnight", () => {
    const end = quietHoursEndAfter(at(2), DEFAULT_QUIET_HOURS);
    expect(end.getDate()).toBe(23);
    expect(end.getHours()).toBe(8);
    expect(end.getMinutes()).toBe(0);
  });

  it("returns tomorrow's end when inside the window before midnight", () => {
    const end = quietHoursEndAfter(at(23), DEFAULT_QUIET_HOURS);
    expect(end.getDate()).toBe(24);
    expect(end.getHours()).toBe(8);
  });

  it("returns the next end even when not currently quiet", () => {
    const end = quietHoursEndAfter(at(12), DEFAULT_QUIET_HOURS);
    expect(end.getDate()).toBe(24);
    expect(end.getHours()).toBe(8);
  });

  it("is always strictly in the future", () => {
    const exactlyEnd = quietHoursEndAfter(at(8), DEFAULT_QUIET_HOURS);
    expect(exactlyEnd.getTime()).toBeGreaterThan(at(8).getTime());
  });
});

describe("formatQuietTime", () => {
  it("zero-pads to a 24-hour clock", () => {
    expect(formatQuietTime(0)).toBe("00:00");
    expect(formatQuietTime(8 * 60)).toBe("08:00");
    expect(formatQuietTime(22 * 60 + 5)).toBe("22:05");
    expect(formatQuietTime(23 * 60 + 59)).toBe("23:59");
  });
});

describe("minutesFromDate", () => {
  it("converts a date to minutes since local midnight", () => {
    expect(minutesFromDate(at(0))).toBe(0);
    expect(minutesFromDate(at(22, 30))).toBe(22 * 60 + 30);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest utils/quietHours.test.ts`
Expected: FAIL — `Cannot find module './quietHours'`.

- [ ] **Step 3: Write the implementation**

Create `artifacts/mobile/utils/quietHours.ts`:

```ts
/**
 * Quiet hours: the window in which the app sends no notifications of its own.
 *
 * Pure module - no React, no storage. The window is a persisted setting and is
 * passed in, and every function takes the reference time explicitly so the
 * tests are not timing-dependent.
 *
 * Stored as minutes since local midnight rather than as a Date, because only
 * the time-of-day is meaningful: a window is a daily recurrence, not an
 * instant, and storing an instant would drift across dates and DST.
 */
export interface QuietHours {
  /** Minutes since local midnight, 0-1439. Inclusive start of the window. */
  startMinute: number;
  /** Minutes since local midnight, 0-1439. Exclusive end of the window. */
  endMinute: number;
}

const MINUTES_PER_DAY = 24 * 60;

/** 22:00-08:00. A suggestion the user can change, never an imposition. */
export const DEFAULT_QUIET_HOURS: QuietHours = {
  startMinute: 22 * 60,
  endMinute: 8 * 60,
};

export function minutesFromDate(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** "22:05" - a zero-padded 24-hour clock reading. */
export function formatQuietTime(minute: number): string {
  const wrapped = ((minute % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function isQuietAt(date: Date, window: QuietHours): boolean {
  const { startMinute, endMinute } = window;
  // An empty window means the user has no quiet hours. Reading this as
  // "always quiet" would silently mute every notification the app sends.
  if (startMinute === endMinute) return false;

  const now = minutesFromDate(date);
  if (startMinute < endMinute) return now >= startMinute && now < endMinute;
  // Wraps midnight: after the start OR before the end, one continuous span.
  return now >= startMinute || now < endMinute;
}

/**
 * The next instant at which the window ends, strictly after `date`.
 *
 * Used to defer a notification the app scheduled into quiet hours. Strictness
 * matters: returning `date` itself when it lands exactly on the boundary would
 * schedule a trigger in the past, which expo-notifications delivers instantly.
 */
export function quietHoursEndAfter(date: Date, window: QuietHours): Date {
  const end = new Date(date);
  end.setHours(Math.floor(window.endMinute / 60), window.endMinute % 60, 0, 0);
  if (end.getTime() <= date.getTime()) {
    end.setDate(end.getDate() + 1);
  }
  return end;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest utils/quietHours.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc -p tsconfig.json --noEmit
git add utils/quietHours.ts utils/quietHours.test.ts
git commit -m "feat(mobile): add quiet-hours logic as a pure, injected-now util

Both failure modes here are silent, so both are pinned: a window
wrapping midnight is one continuous span, and start === end means NO
quiet hours - reading it as always-quiet would mute every notification
the app sends with no error anywhere.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Persist quiet hours and expose them through context

**Files:**
- Modify: `artifacts/mobile/services/ReminderService.ts` (storage keys; new getter/setter)
- Modify: `artifacts/mobile/contexts/RemindersContext.tsx`
- Modify: `artifacts/mobile/utils/reminderBackup.ts` (`BackupSettings`)
- Test: `artifacts/mobile/services/ReminderService.test.ts`, `artifacts/mobile/utils/reminderBackup.test.ts`

**Interfaces:**
- Consumes: Task 3's `QuietHours`, `DEFAULT_QUIET_HOURS`.
- Produces:
  - `QUIET_HOURS_KEY: string`
  - `getQuietHours(): Promise<QuietHours>`
  - `setQuietHours(window: QuietHours): Promise<void>`
  - Context: `quietHours: QuietHours`, `setQuietHours: (w: QuietHours) => Promise<void>`

- [ ] **Step 1: Write the failing tests**

In `artifacts/mobile/services/ReminderService.test.ts`:

```ts
describe("quiet hours persistence", () => {
  it("defaults to 22:00-08:00 when nothing is stored", async () => {
    expect(await getQuietHours()).toEqual(DEFAULT_QUIET_HOURS);
  });

  it("round-trips a stored window", async () => {
    await setQuietHours({ startMinute: 9 * 60, endMinute: 17 * 60 });
    expect(await getQuietHours()).toEqual({ startMinute: 540, endMinute: 1020 });
  });

  // A corrupt value must not be able to wedge scheduling, matching the
  // defensive read used for every other setting in this service.
  it("falls back to the default on a corrupt stored value", async () => {
    await AsyncStorage.setItem(QUIET_HOURS_KEY, "not json");
    expect(await getQuietHours()).toEqual(DEFAULT_QUIET_HOURS);

    await AsyncStorage.setItem(QUIET_HOURS_KEY, JSON.stringify({ startMinute: "9pm" }));
    expect(await getQuietHours()).toEqual(DEFAULT_QUIET_HOURS);

    await AsyncStorage.setItem(QUIET_HOURS_KEY, JSON.stringify({ startMinute: -5, endMinute: 99999 }));
    expect(await getQuietHours()).toEqual(DEFAULT_QUIET_HOURS);
  });
});
```

In `artifacts/mobile/utils/reminderBackup.test.ts`:

```ts
// BackupSettings is an explicit allow-list, not a spread - a new setting
// silently vanishes from every backup unless it is added there.
it("carries quiet hours through a backup round-trip", () => {
  const json = serializeBackup([], { quietHours: { startMinute: 1320, endMinute: 480 } });
  const result = parseBackup(json);

  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.backup.settings.quietHours).toEqual({ startMinute: 1320, endMinute: 480 });
});
```

Check `serializeBackup`'s actual signature in `utils/reminderBackup.ts` before writing this test and match it; the settings argument shape is already established there by the existing tests.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest services/ReminderService.test.ts -t "quiet hours persistence"` then `npx jest utils/reminderBackup.test.ts -t "quiet hours"`
Expected: FAIL — `getQuietHours` is not exported; `settings.quietHours` is `undefined`.

- [ ] **Step 3: Write the implementation**

In `services/ReminderService.ts`, add the import at the top alongside the other util imports:

```ts
import { DEFAULT_QUIET_HOURS, type QuietHours } from "@/utils/quietHours";
```

Add the key next to `SNOOZE_PRESET_KEY`:

```ts
export const QUIET_HOURS_KEY = "@quiet_hours_v1";
```

Add the getter and setter next to the other settings accessors:

```ts
function isQuietHours(value: unknown): value is QuietHours {
  if (typeof value !== "object" || value === null) return false;
  const q = value as Partial<QuietHours>;
  return (
    typeof q.startMinute === "number" &&
    typeof q.endMinute === "number" &&
    Number.isInteger(q.startMinute) &&
    Number.isInteger(q.endMinute) &&
    q.startMinute >= 0 &&
    q.startMinute < 1440 &&
    q.endMinute >= 0 &&
    q.endMinute < 1440
  );
}

export async function getQuietHours(): Promise<QuietHours> {
  try {
    const raw = await AsyncStorage.getItem(QUIET_HOURS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // A corrupt or out-of-range value must not be able to wedge scheduling.
      if (isQuietHours(parsed)) return parsed;
    }
  } catch {}
  return DEFAULT_QUIET_HOURS;
}

export async function setQuietHours(window: QuietHours): Promise<void> {
  await AsyncStorage.setItem(QUIET_HOURS_KEY, JSON.stringify(window));
}
```

Export the type for consumers: add `export type { QuietHours };` next to the existing `export type { SnoozePreset };`.

In `utils/reminderBackup.ts`, add to `BackupSettings`:

```ts
  quietHours?: QuietHours;
```

and import the type: `import type { QuietHours } from "@/utils/quietHours";`

In `contexts/RemindersContext.tsx`, follow the exact pattern already used by `snoozePreset`:
- import `getQuietHours`, `setQuietHours as serviceSetQuietHours`, and the `QuietHours` type;
- add `quietHours: QuietHours;` and `setQuietHours: (w: QuietHours) => Promise<void>;` to `RemindersContextType`;
- add `const [quietHours, setQuietHoursState] = useState<QuietHours>(DEFAULT_QUIET_HOURS);`
- add `getQuietHours()` to the `Promise.all` in `loadFromStorage` and `setQuietHoursState(...)` to the assignments below it;
- add the `useCallback` setter and both values to the provider's `value` object.

Also add `quietHours` to whatever settings object the backup builder assembles in `ReminderService.buildBackupJson`, matching how `snoozePreset` is included there.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest services/ReminderService.test.ts utils/reminderBackup.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npx jest` then `npx tsc -p tsconfig.json --noEmit`
Expected: all suites pass. The context change touches every screen test, so a failure here is most likely a missing provider value.

- [ ] **Step 6: Commit**

```bash
git add services/ReminderService.ts services/ReminderService.test.ts contexts/RemindersContext.tsx utils/reminderBackup.ts utils/reminderBackup.test.ts
git commit -m "feat(mobile): persist quiet hours as a user setting

Suggests 22:00-08:00 rather than imposing it - a night-shift user's
quiet window may be 09:00-17:00. Added to BackupSettings explicitly,
which is an allow-list rather than a spread, so a new setting vanishes
from every backup without it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The Smart Alerts screen

A dedicated screen reached from a row at the top of Settings. This task ships it with quiet hours only; Plan B adds the intensity cards.

> **Known trap — read before starting.** Adding a new route file fails typecheck with `TS2820: Type '"/smart-alerts"' is not assignable ... Did you mean '"/add-reminder"'?`, which reads like a typo but is not. Expo Router's typed-route union lives in the **generated** `.expo/types/router.d.ts`, which does not know about a file the CLI has not seen. Fix by running an Expo CLI command that regenerates types (`npx expo customize tsconfig.json` was sufficient last time) and re-running `tsc`. **Do not cast the pathname or widen the type** — that discards the typed-route guarantee for every route to work around a stale cache. This is documented in `system_learnings.md` (2026-08-17).

**Files:**
- Create: `artifacts/mobile/app/smart-alerts.tsx`
- Modify: `artifacts/mobile/app/_layout.tsx` (register the route in the `Stack`)
- Modify: `artifacts/mobile/app/(tabs)/settings.tsx` (add the entry row)
- Test: `artifacts/mobile/__tests__/screens/smart-alerts.test.tsx`, `artifacts/mobile/__tests__/screens/settings.test.tsx`

**Interfaces:**
- Consumes: Task 4's `quietHours` / `setQuietHours` from `useReminders()`; Task 3's `formatQuietTime`.
- Produces: route `/smart-alerts`. TestIDs: `quiet-hours-start`, `quiet-hours-end`, `why-tasks-slip-row`.

- [ ] **Step 1: Write the failing test**

Create `artifacts/mobile/__tests__/screens/smart-alerts.test.tsx`:

```tsx
import React from "react";
import { render, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import SmartAlertsScreen from "@/app/smart-alerts";
import { RemindersProvider } from "@/contexts/RemindersContext";
import { QUIET_HOURS_KEY } from "@/services/ReminderService";

jest.mock("expo-haptics");
jest.mock("expo-router", () => ({ router: { back: jest.fn(), push: jest.fn() } }));

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <RemindersProvider>
        <SmartAlertsScreen />
      </RemindersProvider>
    </SafeAreaProvider>
  );
}

beforeEach(async () => {
  jest.clearAllMocks();
  await (AsyncStorage as any).clear();
});

describe("SmartAlertsScreen", () => {
  it("shows the default quiet-hours window", async () => {
    const { findByTestId } = renderScreen();
    expect((await findByTestId("quiet-hours-start")).props.children).toBe("22:00");
    expect((await findByTestId("quiet-hours-end")).props.children).toBe("08:00");
  });

  it("shows a stored window", async () => {
    await AsyncStorage.setItem(
      QUIET_HOURS_KEY,
      JSON.stringify({ startMinute: 9 * 60, endMinute: 17 * 60 })
    );
    const { findByTestId } = renderScreen();
    await waitFor(async () =>
      expect((await findByTestId("quiet-hours-start")).props.children).toBe("09:00")
    );
    expect((await findByTestId("quiet-hours-end")).props.children).toBe("17:00");
  });

  it("offers a way into the explainer", async () => {
    const { findByTestId } = renderScreen();
    expect(await findByTestId("why-tasks-slip-row")).toBeTruthy();
  });
});
```

Add to `artifacts/mobile/__tests__/screens/settings.test.tsx`:

```tsx
describe("SettingsScreen — Smart Alerts entry", () => {
  it("offers a row into the Smart Alerts screen", async () => {
    const { findByTestId } = renderScreen();
    fireEvent.press(await findByTestId("smart-alerts-row"));
    expect(router.push).toHaveBeenCalledWith("/smart-alerts");
  });
});
```

That file already mocks `expo-router`; reuse its existing `router` import rather than adding a second mock.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/screens/smart-alerts.test.tsx __tests__/screens/settings.test.tsx`
Expected: FAIL — `Cannot find module '@/app/smart-alerts'`, and no `smart-alerts-row`.

- [ ] **Step 3: Create the screen**

Create `artifacts/mobile/app/smart-alerts.tsx`. Model the header and card styling on `app/(tabs)/settings.tsx` — same `useColors()` tokens, same `alarmCard`/`descriptionCard` shapes — so it reads as part of the same app:

```tsx
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useReminders } from "@/contexts/RemindersContext";
import { useColors } from "@/hooks/useColors";
import { formatQuietTime, minutesFromDate } from "@/utils/quietHours";

type DateTimePickerEvent = { type: string; nativeEvent: object };
const DateTimePicker: React.ComponentType<any> | null =
  Platform.OS !== "web"
    ? require("@react-native-community/datetimepicker").default
    : null;

/** Which end of the window the open picker is editing. */
type PickerTarget = "start" | "end" | null;

export default function SmartAlertsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { quietHours, setQuietHours } = useReminders();
  const [picking, setPicking] = useState<PickerTarget>(null);

  const dateForMinute = (minute: number) => {
    const d = new Date();
    d.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
    return d;
  };

  const handlePicked = (event: DateTimePickerEvent, selected?: Date) => {
    const target = picking;
    setPicking(null);
    if (event.type === "dismissed" || !selected || !target) return;
    const minute = minutesFromDate(selected);
    setQuietHours(
      target === "start"
        ? { ...quietHours, startMinute: minute }
        : { ...quietHours, endMinute: minute }
    );
  };

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + 12,
      paddingHorizontal: 20,
      paddingBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground },
    content: { paddingHorizontal: 20, paddingBottom: insets.bottom + 24 },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radiusCard,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 12,
    },
    label: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    subLabel: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
      lineHeight: 18,
    },
    timeRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14 },
    timeBtn: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 10,
      backgroundColor: colors.muted,
    },
    timeText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: colors.primary },
    timeSep: { fontSize: 14, color: colors.mutedForeground },
    row: { flexDirection: "row", alignItems: "center", gap: 12 },
    footer: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 19,
      marginTop: 4,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} testID="smart-alerts-back">
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Smart Alerts</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.label}>Quiet hours</Text>
          <Text style={styles.subLabel}>
            Nothing the app schedules on its own arrives during these hours.
            Reminders you set yourself are always kept.
          </Text>
          <View style={styles.timeRow}>
            <Pressable
              style={styles.timeBtn}
              onPress={() => setPicking("start")}
              accessibilityRole="button"
              accessibilityLabel="Quiet hours start"
            >
              <Text style={styles.timeText} testID="quiet-hours-start">
                {formatQuietTime(quietHours.startMinute)}
              </Text>
            </Pressable>
            <Text style={styles.timeSep}>to</Text>
            <Pressable
              style={styles.timeBtn}
              onPress={() => setPicking("end")}
              accessibilityRole="button"
              accessibilityLabel="Quiet hours end"
            >
              <Text style={styles.timeText} testID="quiet-hours-end">
                {formatQuietTime(quietHours.endMinute)}
              </Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          style={styles.card}
          onPress={() => router.push("/why-tasks-slip")}
          testID="why-tasks-slip-row"
        >
          <View style={styles.row}>
            <Feather name="help-circle" size={18} color={colors.mutedForeground} />
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Why tasks slip</Text>
              <Text style={styles.subLabel}>
                What the research says about putting things off
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
          </View>
        </Pressable>

        <Text style={styles.footer}>
          When a task keeps getting postponed, the app stops sending alerts for
          it and offers to help instead.
        </Text>
      </ScrollView>

      {picking !== null && DateTimePicker && (
        <DateTimePicker
          value={dateForMinute(
            picking === "start" ? quietHours.startMinute : quietHours.endMinute
          )}
          mode="time"
          display="default"
          onChange={handlePicked}
        />
      )}
    </View>
  );
}
```

**Note:** `/why-tasks-slip` does not exist until Task 8. Implement Tasks 5 and 8 in order, or the route push will fail typecheck.

- [ ] **Step 4: Register the route and add the Settings row**

In `app/_layout.tsx`, add inside the `<Stack>` alongside the other screens:

```tsx
      <Stack.Screen name="smart-alerts" options={{ headerShown: false }} />
      <Stack.Screen name="why-tasks-slip" options={{ headerShown: false }} />
```

In `app/(tabs)/settings.tsx`, add this row as the **first** row of the list, before the existing "Your name" row, following the same `Pressable` shape those rows use:

```tsx
        <Pressable
          style={[styles.alarmCard, styles.descriptionCard, styles.debugRow]}
          onPress={() => router.push("/smart-alerts")}
          testID="smart-alerts-row"
        >
          <Feather name="bell" size={18} color={colors.mutedForeground} />
          <View style={{ flex: 1 }}>
            <Text style={styles.alarmLabel}>Smart Alerts</Text>
            <Text style={styles.alarmSubLabel}>
              Quiet hours, and how the app follows up on what slips
            </Text>
          </View>
          <Feather
            name="chevron-right"
            size={18}
            color={colors.mutedForeground}
            style={styles.chevron}
          />
        </Pressable>
```

Add `import { router } from "expo-router";` to that file if it is not already imported.

- [ ] **Step 5: Regenerate router types, then typecheck**

```bash
npx expo customize tsconfig.json
npx tsc -p tsconfig.json --noEmit
```

Expected: clean. If `TS2820` still names `/smart-alerts`, the generated `.expo/types/router.d.ts` is still stale — re-run the Expo command. Do not cast the pathname.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest __tests__/screens/smart-alerts.test.tsx __tests__/screens/settings.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/smart-alerts.tsx app/_layout.tsx "app/(tabs)/settings.tsx" __tests__/screens/smart-alerts.test.tsx __tests__/screens/settings.test.tsx .expo/types/router.d.ts
git commit -m "feat(mobile): add a Smart Alerts screen with quiet hours

A Settings row rather than a fourth tab: the tab bar is
Home/Settings/About, and a configuration screen does not earn permanent
bottom-bar space. Quiet hours is the only control here with a
configuration surface, because the default is genuinely wrong for
night-shift users in a way a preset list would not be.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Confirm a reminder set inside quiet hours

The asymmetry that matters: the app defers *its own* notifications silently, but only ever **asks** about a time the user chose deliberately. Never blocks — 2am medication and night-shift work are real, and an app that refuses to set them is broken. "Keep it" is a first-class path, not a grudging escape.

**Files:**
- Create: `artifacts/mobile/components/QuietHoursSheet.tsx`
- Modify: `artifacts/mobile/components/QuickAddInput.tsx`
- Test: `artifacts/mobile/__tests__/components/QuickAddInput.test.tsx`

**Interfaces:**
- Consumes: Task 3's `isQuietAt`, `quietHoursEndAfter`, `formatQuietTime`; Task 4's `quietHours` from `useReminders()`.
- Produces: `QuietHoursSheet` with props `{ visible, datetime: Date, quietEnd: Date, onKeep, onMove, onCancel }`. TestIDs: `quiet-hours-sheet-keep`, `quiet-hours-sheet-move`.

- [ ] **Step 1: Write the failing test**

Add to `artifacts/mobile/__tests__/components/QuickAddInput.test.tsx`:

```tsx
describe("QuickAddInput — quiet hours confirmation", () => {
  // 23:30 tonight, comfortably inside the default 22:00-08:00 window.
  function tonightAt(hour: number, minute = 0): Date {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    return d;
  }

  it("asks before saving a reminder inside quiet hours, and keeps it when told to", async () => {
    const { findByTestId } = renderComponent();
    const target = tonightAt(23, 30);

    fireEvent.changeText(await findByTestId("quick-add-input"), "Take the tablet");
    fireEvent.press(await findByTestId("quick-add-save"));
    // Nothing saved yet - the sheet is asking first.
    expect(await AsyncStorage.getItem(STORAGE_KEY)).toBeNull();

    fireEvent.press(await findByTestId("quiet-hours-sheet-keep"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "[]");
      expect(stored).toHaveLength(1);
      expect(new Date(stored[0].datetime).getHours()).toBe(23);
    });
    void target;
  });

  it("moves the reminder to the end of quiet hours when asked", async () => {
    const { findByTestId } = renderComponent();

    fireEvent.changeText(await findByTestId("quick-add-input"), "Take the tablet");
    fireEvent.press(await findByTestId("quick-add-save"));
    fireEvent.press(await findByTestId("quiet-hours-sheet-move"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "[]");
      expect(stored).toHaveLength(1);
      expect(new Date(stored[0].datetime).getHours()).toBe(8);
      expect(new Date(stored[0].datetime).getMinutes()).toBe(0);
    });
  });

  it("saves without asking when the time is outside quiet hours", async () => {
    const { findByTestId, queryByTestId } = renderComponent();

    fireEvent.changeText(await findByTestId("quick-add-input"), "Call the plumber");
    fireEvent.press(await findByTestId("quick-add-save"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "[]");
      expect(stored).toHaveLength(1);
    });
    expect(queryByTestId("quiet-hours-sheet-keep")).toBeNull();
  });
});
```

For the first two tests the typed text must parse to a time inside quiet hours; use a phrase the existing parser handles, e.g. `"Take the tablet at 11:30pm"`. For the third use `"Call the plumber at 2pm"`. Check `utils/parseNaturalLanguage.test.ts` for phrasing the parser is already proven to handle, and adjust the assertions to the resulting hour.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest __tests__/components/QuickAddInput.test.tsx -t "quiet hours confirmation"`
Expected: FAIL — no `quiet-hours-sheet-keep` element; the reminder saves immediately.

- [ ] **Step 3: Create the sheet**

Create `artifacts/mobile/components/QuietHoursSheet.tsx`, modelled on `components/ConfirmSheet.tsx` (same overlay, handle, and sheet styling):

```tsx
import React from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { formatQuietTime, minutesFromDate } from "@/utils/quietHours";

interface Props {
  visible: boolean;
  /** The time the user actually chose. */
  datetime: Date;
  /** When the quiet window ends - the offered alternative. */
  quietEnd: Date;
  onKeep: () => void;
  onMove: () => void;
  onCancel: () => void;
}

/**
 * Asks - never blocks - about a reminder the user deliberately set inside
 * their quiet hours. 2am medication and night-shift work are real, so "Keep
 * it" is a first-class path listed first, not a grudging escape hatch.
 */
export default function QuietHoursSheet({
  visible,
  datetime,
  quietEnd,
  onKeep,
  onMove,
  onCancel,
}: Props) {
  const colors = useColors();

  const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
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
      marginBottom: 4,
    },
    message: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 20,
      lineHeight: 20,
    },
    primaryBtn: {
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: "center",
      marginBottom: 10,
    },
    primaryText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.primaryForeground,
    },
    secondaryBtn: {
      paddingVertical: 13,
      borderRadius: 12,
      backgroundColor: colors.muted,
      alignItems: "center",
    },
    secondaryText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
    },
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable onPress={() => {}} style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>
            That&apos;s {formatQuietTime(minutesFromDate(datetime))}, inside your quiet hours
          </Text>
          <Text style={styles.message}>
            Quiet hours only hold back alerts the app schedules by itself. If
            this one is meant for then, keep it.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={onKeep} testID="quiet-hours-sheet-keep">
            <Text style={styles.primaryText}>Keep it</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={onMove} testID="quiet-hours-sheet-move">
            <Text style={styles.secondaryText}>
              Move to {formatQuietTime(minutesFromDate(quietEnd))}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
```

- [ ] **Step 4: Wire it into QuickAddInput**

In `components/QuickAddInput.tsx`:

Add imports:

```tsx
import QuietHoursSheet from "@/components/QuietHoursSheet";
import { isQuietAt, quietHoursEndAfter } from "@/utils/quietHours";
```

Add `quietHours` to the existing `useReminders()` destructure, and this state:

```tsx
  const [quietPrompt, setQuietPrompt] = useState<Date | null>(null);
```

`doSave` currently saves unconditionally. Split the check out so both the parsed-date path and the no-time path go through it. Insert this guard at the top of `doSave`, before `setSaving(true)`:

```tsx
    // Ask, never block. The user chose this time deliberately, so the only
    // wrong move here is refusing to set it.
    if (isQuietAt(dateToUse, quietHours)) {
      setQuietPrompt(dateToUse);
      return;
    }
```

Extract the existing body of `doSave` (everything from `setSaving(true)` onward) into `const performSave = async (dateToUse: Date) => { ... }`, and have `doSave` call `performSave(dateToUse)` when not quiet. The sheet's handlers then call `performSave` directly, bypassing the guard:

```tsx
  const handleQuietKeep = async () => {
    const target = quietPrompt;
    setQuietPrompt(null);
    if (target) await performSave(target);
  };

  const handleQuietMove = async () => {
    const target = quietPrompt;
    setQuietPrompt(null);
    if (target) await performSave(quietHoursEndAfter(target, quietHours));
  };
```

Render the sheet next to the other modals in that component:

```tsx
      {quietPrompt && (
        <QuietHoursSheet
          visible
          datetime={quietPrompt}
          quietEnd={quietHoursEndAfter(quietPrompt, quietHours)}
          onKeep={handleQuietKeep}
          onMove={handleQuietMove}
          onCancel={() => setQuietPrompt(null)}
        />
      )}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest __tests__/components/QuickAddInput.test.tsx`
Expected: PASS, including all pre-existing tests in that file.

- [ ] **Step 6: Typecheck and commit**

```bash
npx tsc -p tsconfig.json --noEmit
git add components/QuietHoursSheet.tsx components/QuickAddInput.tsx __tests__/components/QuickAddInput.test.tsx
git commit -m "feat(mobile): confirm a reminder set inside quiet hours

Asks, never blocks, and lists Keep it first. Quiet hours exist to hold
back alerts the APP schedules; a time the user chose deliberately is a
different thing, and 2am medication is a real reason to choose one. An
app that refuses to set it is simply broken.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Vague-task detection at input

Targets the "sort out insurance" failure at its source: a task with no obvious first physical action has nothing to start, so it stalls. Advisory only — the user can always save exactly what they typed.

**Files:**
- Create: `artifacts/mobile/utils/vagueTask.ts`
- Create: `artifacts/mobile/utils/vagueTask.test.ts`
- Modify: `artifacts/mobile/components/QuickAddInput.tsx`
- Test: `artifacts/mobile/__tests__/components/QuickAddInput.test.tsx`

**Interfaces:**
- Consumes: `MALAYALAM_RANGE` from `utils/parseNaturalLanguage.ts`.
- Produces: `VAGUE_OPENERS: readonly string[]`, `detectVagueOpener(title: string): string | null`.

- [ ] **Step 1: Write the failing test**

Create `artifacts/mobile/utils/vagueTask.test.ts`:

```ts
import { detectVagueOpener } from "./vagueTask";

describe("detectVagueOpener", () => {
  it("matches a vague opener regardless of case", () => {
    expect(detectVagueOpener("Sort out the insurance")).toBe("sort out");
    expect(detectVagueOpener("sort out the insurance")).toBe("sort out");
    expect(detectVagueOpener("Deal with the landlord")).toBe("deal with");
    expect(detectVagueOpener("Look into pension options")).toBe("look into");
    expect(detectVagueOpener("Figure out the visa thing")).toBe("figure out");
  });

  // Concrete tasks are the common case. A hint that fires on them is noise,
  // and noise is how an advisory hint gets ignored permanently.
  it("leaves a concrete task alone", () => {
    expect(detectVagueOpener("Call the dentist")).toBeNull();
    expect(detectVagueOpener("Pay the electricity bill")).toBeNull();
    expect(detectVagueOpener("Send Priya the photos")).toBeNull();
    expect(detectVagueOpener("Buy milk")).toBeNull();
  });

  // Only the OPENER counts. "Call the bank to sort out the fee" already names
  // a first action, so flagging it would be wrong.
  it("only matches at the start of the title", () => {
    expect(detectVagueOpener("Call the bank to sort out the fee")).toBeNull();
  });

  it("requires a word boundary, not a prefix match", () => {
    expect(detectVagueOpener("Planning permission paperwork")).toBeNull();
    expect(detectVagueOpener("Reviewer feedback")).toBeNull();
  });

  it("ignores leading whitespace", () => {
    expect(detectVagueOpener("   sort out the insurance")).toBe("sort out");
  });

  // The heuristic is verb-position-dependent. Malayalam verbs are final and
  // inflected, so it does not transfer - deferred exactly as INVITE_NUDGES_ML is.
  it("never fires on Malayalam text", () => {
    expect(detectVagueOpener("ഇൻഷുറൻസ് ശരിയാക്കുക")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(detectVagueOpener("")).toBeNull();
    expect(detectVagueOpener("   ")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest utils/vagueTask.test.ts`
Expected: FAIL — `Cannot find module './vagueTask'`.

- [ ] **Step 3: Write the implementation**

Create `artifacts/mobile/utils/vagueTask.ts`:

```ts
import { MALAYALAM_RANGE } from "@/utils/parseNaturalLanguage";

/**
 * Openers that name an intention rather than an action.
 *
 * Deliberately short. A broad list fires on ordinary tasks, and an advisory
 * hint that cries wolf is one the user learns to dismiss without reading -
 * which costs more than never having shown it.
 *
 * English only, by design: this heuristic depends on the verb coming FIRST,
 * and Malayalam verbs are final and inflected. Deferred for the same reason
 * as INVITE_NUDGES_ML in utils/inviteNudges.ts - it needs a native speaker to
 * write, not a translation.
 */
export const VAGUE_OPENERS = [
  "sort out",
  "deal with",
  "look into",
  "figure out",
  "think about",
  "organise",
  "organize",
  "handle",
  "review",
  "plan",
] as const;

/**
 * The vague opener this title starts with, or null.
 *
 * Matches only at the START: "Call the bank to sort out the fee" already names
 * a first action and must not be flagged.
 */
export function detectVagueOpener(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  // The heuristic does not transfer to Malayalam; do not guess there.
  if (MALAYALAM_RANGE.test(trimmed)) return null;

  const lower = trimmed.toLowerCase();
  for (const opener of VAGUE_OPENERS) {
    if (!lower.startsWith(opener)) continue;
    // Require a boundary so "plan" does not match "Planning permission".
    const next = lower.charAt(opener.length);
    if (next === "" || next === " ") return opener;
  }
  return null;
}
```

**Check before running:** `MALAYALAM_RANGE` may be a global-flagged regex, in which case `.test()` is stateful across calls via `lastIndex` and will return alternating results. Open `utils/parseNaturalLanguage.ts` and confirm. If it carries the `g` flag, test with `new RegExp(MALAYALAM_RANGE.source).test(trimmed)` instead — and add a test that calls `detectVagueOpener` twice on the same Malayalam string and expects `null` both times.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest utils/vagueTask.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing UI test**

Add to `artifacts/mobile/__tests__/components/QuickAddInput.test.tsx`:

```tsx
describe("QuickAddInput — vague task hint", () => {
  it("suggests a first action for a vague opener", async () => {
    const { findByTestId, findByText } = renderComponent();
    fireEvent.changeText(await findByTestId("quick-add-input"), "Sort out the insurance");
    expect(await findByText(/first step/i)).toBeTruthy();
  });

  it("shows no hint for a concrete task", async () => {
    const { findByTestId, queryByTestId } = renderComponent();
    fireEvent.changeText(await findByTestId("quick-add-input"), "Call the dentist at 3pm");
    await waitFor(() => expect(queryByTestId("vague-task-hint")).toBeNull());
  });

  // Advisory means advisory: dismissing it must not come back for the same text.
  it("stays dismissed for the same text", async () => {
    const { findByTestId, queryByTestId } = renderComponent();
    const input = await findByTestId("quick-add-input");

    fireEvent.changeText(input, "Sort out the insurance");
    fireEvent.press(await findByTestId("vague-task-hint-dismiss"));
    await waitFor(() => expect(queryByTestId("vague-task-hint")).toBeNull());

    fireEvent.changeText(input, "Sort out the insurance");
    await waitFor(() => expect(queryByTestId("vague-task-hint")).toBeNull());
  });

  it("never blocks saving", async () => {
    const { findByTestId } = renderComponent();
    fireEvent.changeText(
      await findByTestId("quick-add-input"),
      "Sort out the insurance tomorrow at 2pm"
    );
    fireEvent.press(await findByTestId("quick-add-save"));

    await waitFor(async () => {
      const stored = JSON.parse((await AsyncStorage.getItem(STORAGE_KEY)) ?? "[]");
      expect(stored).toHaveLength(1);
      expect(stored[0].title).toContain("Sort out the insurance");
    });
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx jest __tests__/components/QuickAddInput.test.tsx -t "vague task hint"`
Expected: FAIL — no hint rendered.

- [ ] **Step 7: Add the hint to QuickAddInput**

Add the import and state:

```tsx
import { detectVagueOpener } from "@/utils/vagueTask";
```

```tsx
  const [dismissedVagueText, setDismissedVagueText] = useState<string | null>(null);
```

Derive the hint from the parsed title (falling back to the raw input), so it tracks what will actually be saved:

```tsx
  const vagueOpener = detectVagueOpener(parsedTitle || input);
  const showVagueHint =
    !!vagueOpener && (parsedTitle || input).trim() !== dismissedVagueText;
```

Render it below the input, next to the existing `micNotice` block:

```tsx
      {showVagueHint && (
        <View style={styles.vagueHint} testID="vague-task-hint">
          <Text style={styles.vagueHintText}>
            What&apos;s the first step? A reminder is easier to start when it
            names one action — e.g. &quot;Call HDFC about the renewal&quot;.
          </Text>
          <Pressable
            onPress={() => setDismissedVagueText((parsedTitle || input).trim())}
            hitSlop={8}
            testID="vague-task-hint-dismiss"
          >
            <Text style={styles.vagueHintDismiss}>Use as is</Text>
          </Pressable>
        </View>
      )}
```

Add to the `StyleSheet.create` block in that component:

```tsx
    vagueHint: {
      marginTop: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.muted,
      gap: 6,
    },
    vagueHintText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 17,
    },
    vagueHintDismiss: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
      alignSelf: "flex-start",
    },
```

Also clear `dismissedVagueText` in the reset block of `performSave` (where `setInput("")` and friends live), so the next reminder starts fresh.

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx jest __tests__/components/QuickAddInput.test.tsx utils/vagueTask.test.ts`
Expected: PASS.

- [ ] **Step 9: Typecheck and commit**

```bash
npx tsc -p tsconfig.json --noEmit
git add utils/vagueTask.ts utils/vagueTask.test.ts components/QuickAddInput.tsx __tests__/components/QuickAddInput.test.tsx
git commit -m "feat(mobile): nudge a vague reminder toward a first action

\"Sort out insurance\" is a project wearing a reminder's clothing: with
no first physical action there is nothing to start, so it stalls.
Advisory only - a creation flow that argues with you is one you stop
using, and the quick-add bar's whole value is being fast.

The opener list is deliberately short. A hint that fires on ordinary
tasks is noise, and noise gets dismissed unread.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: The "Why tasks slip" explainer

The content is itself an intervention: learning that procrastination is mood-regulation rather than laziness measurably reduces it, because shame sustains the cycle. Progressive disclosure — four skimmable cards, with the cited article behind them.

**Files:**
- Create: `artifacts/mobile/app/why-tasks-slip.tsx`
- Create: `artifacts/mobile/constants/whyTasksSlip.ts`
- Test: `artifacts/mobile/__tests__/screens/why-tasks-slip.test.tsx`

**Interfaces:**
- Consumes: route registration added in Task 5.
- Produces: route `/why-tasks-slip`; `SLIP_CARDS: readonly { title, body, action }[]`, `REFERENCES: readonly { claim, citation }[]`.

- [ ] **Step 1: Verify every citation before writing any of it**

**Do this step first and do not skip it.** The four cards make plain-language claims and need no citations. The article layer cites research, and a screen whose entire purpose is credibility fails completely on one wrong citation — a reader who catches an error will reasonably discount everything else, including the parts that would have helped.

The relevant literature is believed to include: Sirois & Pychyl on procrastination as short-term mood repair; Steel's meta-analysis on the nature of procrastination; Gollwitzer on implementation intentions; Sirois on self-compassion and procrastination. **These are recalled, not verified.**

For each, use WebSearch/WebFetch to confirm: author list, year, exact title, publication venue, and — most importantly — that the paper actually supports the specific claim being attributed to it. **Drop any citation you cannot confirm rather than approximating it.** A card with no citation is fine; a card with a wrong one is not. Record the verified list in `constants/whyTasksSlip.ts` as the `REFERENCES` array.

- [ ] **Step 2: Write the failing test**

Create `artifacts/mobile/__tests__/screens/why-tasks-slip.test.tsx`:

```tsx
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import WhyTasksSlipScreen from "@/app/why-tasks-slip";
import { SLIP_CARDS } from "@/constants/whyTasksSlip";

jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 640 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <WhyTasksSlipScreen />
    </SafeAreaProvider>
  );
}

describe("WhyTasksSlipScreen", () => {
  it("shows all four mechanism cards", async () => {
    const { findByText } = renderScreen();
    expect(SLIP_CARDS).toHaveLength(4);
    for (const card of SLIP_CARDS) {
      expect(await findByText(card.title)).toBeTruthy();
    }
  });

  it("keeps the full article collapsed until asked for", async () => {
    const { queryByTestId, findByTestId } = renderScreen();
    expect(queryByTestId("full-article")).toBeNull();

    fireEvent.press(await findByTestId("read-more"));
    expect(await findByTestId("full-article")).toBeTruthy();
  });

  // The copy rule for this whole feature: describe the mechanism, never
  // diagnose the reader. A sentence readable as an accusation fails.
  it("never addresses the reader as the problem", async () => {
    for (const card of SLIP_CARDS) {
      const text = `${card.title} ${card.body}`.toLowerCase();
      expect(text).not.toMatch(/\byou are\b|\byou're\b|\blazy\b|\bfailed\b/);
    }
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest __tests__/screens/why-tasks-slip.test.tsx`
Expected: FAIL — `Cannot find module '@/constants/whyTasksSlip'`.

- [ ] **Step 4: Write the content module**

Create `artifacts/mobile/constants/whyTasksSlip.ts`:

```ts
/**
 * Content for the "Why tasks slip" screen.
 *
 * This is editorial content, NOT statistics: it contains nothing about the
 * individual user and no number derived from their history. That separation is
 * deliberate - a completion rate or streak is a shame engine, and shame
 * reliably increases procrastination rather than reducing it.
 *
 * Copy rule: describe the mechanism as it works for everyone, never diagnose
 * the reader. A sentence that can be read as an accusation fails, however
 * accurate it is.
 */
export interface SlipCard {
  title: string;
  body: string;
  action: string;
}

export const SLIP_CARDS: readonly SlipCard[] = [
  {
    title: "It's about mood, not laziness",
    body: "Putting something off gives real, immediate relief from the discomfort of thinking about it. That relief is why it works, and why it repeats.",
    action: "Shrink it: do just two minutes.",
  },
  {
    title: "\"Sort out insurance\" isn't a task",
    body: "It names an intention, not an action. With no obvious first physical move, there is nothing to actually start.",
    action: "Name the first phone call instead.",
  },
  {
    title: "The clock isn't the problem",
    body: "A time-based reminder assumes the hour predicts availability. Two o'clock found you in a meeting; the reminder was fine, the moment wasn't.",
    action: "Move it to when you're actually free.",
  },
  {
    title: "Eleven things on a Tuesday",
    body: "A day with too much on it tends to produce none of it, and then the list itself becomes something to avoid opening.",
    action: "Pick the three that matter.",
  },
] as const;

export interface Reference {
  /** The specific claim this source supports. */
  claim: string;
  /** Full citation, VERIFIED against the paper - see plan Task 8, Step 1. */
  citation: string;
}

/**
 * Populated in Step 1 of this task, from sources actually checked. Any source
 * that could not be confirmed is omitted rather than approximated.
 */
export const REFERENCES: readonly Reference[] = [];

export const ARTICLE_BODY = [
  "Procrastination looks like a time-management problem and behaves like an emotional one. When a task carries dread - a difficult call, an unopened bill - postponing it produces immediate relief. Nothing about the task changed, but the feeling did, and that is the reward being reinforced.",
  "This is why being chased harder tends not to help. Another reminder restates the demand, which re-activates exactly the discomfort being avoided. What does help is making the task smaller, so there is less to feel bad about starting.",
  "It also explains why self-criticism backfires. Feeling worse about a postponed task raises the discomfort attached to it, which makes the next postponement more likely, not less.",
] as const;
```

- [ ] **Step 5: Write the screen**

Create `artifacts/mobile/app/why-tasks-slip.tsx`. Match the header shape used in `app/smart-alerts.tsx` from Task 5:

```tsx
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ARTICLE_BODY, REFERENCES, SLIP_CARDS } from "@/constants/whyTasksSlip";
import { useColors } from "@/hooks/useColors";

export default function WhyTasksSlipScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingTop: insets.top + 12,
      paddingHorizontal: 20,
      paddingBottom: 12,
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
    },
    headerTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground },
    content: { paddingHorizontal: 20, paddingBottom: insets.bottom + 24 },
    card: {
      backgroundColor: colors.card,
      borderRadius: colors.radiusCard,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 12,
    },
    cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    cardBody: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 19,
      marginTop: 6,
    },
    cardAction: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
      marginTop: 10,
    },
    readMore: { paddingVertical: 14, alignItems: "center" },
    readMoreText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: colors.primary },
    para: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      lineHeight: 21,
      marginBottom: 14,
    },
    refHeading: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginTop: 8,
      marginBottom: 8,
    },
    ref: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      lineHeight: 18,
      marginBottom: 10,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} testID="why-tasks-slip-back">
          <Feather name="chevron-left" size={24} color={colors.foreground} />
        </Pressable>
        <Text style={styles.headerTitle}>Why tasks slip</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {SLIP_CARDS.map((card) => (
          <View key={card.title} style={styles.card}>
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.cardBody}>{card.body}</Text>
            <Text style={styles.cardAction}>{card.action}</Text>
          </View>
        ))}

        {!expanded ? (
          <Pressable style={styles.readMore} onPress={() => setExpanded(true)} testID="read-more">
            <Text style={styles.readMoreText}>Read more</Text>
          </Pressable>
        ) : (
          <View testID="full-article">
            {ARTICLE_BODY.map((para) => (
              <Text key={para.slice(0, 24)} style={styles.para}>
                {para}
              </Text>
            ))}
            {REFERENCES.length > 0 && (
              <>
                <Text style={styles.refHeading}>Sources</Text>
                {REFERENCES.map((ref) => (
                  <Text key={ref.citation} style={styles.ref}>
                    {ref.citation}
                  </Text>
                ))}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest __tests__/screens/why-tasks-slip.test.tsx`
Expected: PASS.

- [ ] **Step 7: Full verification**

```bash
npx jest
npx tsc -p tsconfig.json --noEmit
cd ../.. && pnpm run typecheck
```

Expected: all suites pass; typecheck clean across every package.

- [ ] **Step 8: Commit**

```bash
cd artifacts/mobile
git add app/why-tasks-slip.tsx constants/whyTasksSlip.ts __tests__/screens/why-tasks-slip.test.tsx
git commit -m "feat(mobile): explain why tasks slip, in the app

The content is itself the intervention: learning that procrastination
is mood regulation rather than laziness reduces it, because shame is
what sustains the cycle. Four cards for skimming, the cited article
behind them for anyone who wants to check the claims.

Editorial content only - no user data, no numbers, nothing readable as
a grade.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage.** Component 1 (instrumentation) → Task 2, minus `nudgesSent`/`checkInSent`, which are written only by the Plan B scheduler and are called out in Global Constraints. Component 3 (quiet hours) → Tasks 3, 4, 6. Component 4 (input fix) → Task 7. Component 5 (explainer) → Task 8. Settings screen → Task 5. Persistence hardening → Task 1. Backup allow-list gap → Task 4.

**Deferred to Plan B, by design:** the intensity levels (Off/Gentle/Persistent), the nudge ladder, the daily ceiling, the dread override, the shrink prompt, and the check-in notification. The spec sequences these last, on real data.

**Known coupling:** Task 5 pushes `/why-tasks-slip`, created in Task 8. Execute in order, or Task 5's typecheck fails.

**Uncertainty flagged in-place rather than guessed:** the `MALAYALAM_RANGE` global-flag question (Task 7, Step 3), `serializeBackup`'s exact settings signature (Task 4, Step 1), and the natural-language phrasing the parser handles for quiet-hours tests (Task 6, Step 1). Each names how to check rather than assuming an answer.
