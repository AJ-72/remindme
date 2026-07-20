# Backlog items 5, 6, 7 — design

Refines three small backlog items. Ordered easiest-first for implementation.

## 6. Quick-add placeholder overflow

**Problem:** `QuickAddInput.tsx` renders a single-line input in a `flex: 1` field
squeezed between an icon and two action buttons. Its placeholder
`Add a reminder… "Call mom tomorrow at 3pm"` gets clipped rather than wrapping.

**Fix:** Shorten the placeholder to `Add a reminder…` in
`artifacts/mobile/components/QuickAddInput.tsx` (single string change, no
layout/style changes). The Add/Edit Reminder screen's multiline placeholder
(`add-reminder.tsx`) was confirmed fine as-is — no change needed there.

## 5. Show reminder description in notifications, gated by consent

**Current state:** `ReminderService.ts` already puts `reminder.description`
into the notification body unconditionally, in three places: `scheduleNotification`
(body + persisted `data.body`) and `snoozeReminder` (reads `target.description`
directly). There is no consent gate today.

**Design:** add a global, off-by-default setting — "Show description in
notifications" — following the exact pattern of the existing
`defaultAlarmEnabled` setting.

1. `ReminderService.ts`: add `SHOW_DESCRIPTION_KEY = "@show_description_v1"`,
   `getShowDescriptionEnabled()` / `setShowDescriptionEnabled()` (mirrors
   `getDefaultAlarmEnabled`/`setDefaultAlarmEnabled`), default `false`.
2. Add `resolveNotificationBody(description?: string)`: returns `description`
   only when the setting is on and a description exists; otherwise falls back
   to `"Reminder!"` (existing fallback behavior).
3. Use this helper everywhere the notification body is currently built from
   `description` directly: `scheduleNotification` (title/body content +
   persisted `data.body` used later by snooze) and `snoozeReminder`.
4. `RemindersContext.tsx`: add `showDescriptionInNotifications` state +
   `setShowDescriptionInNotifications`, loaded at startup alongside
   `defaultAlarmEnabled`.
5. `app/(tabs)/settings.tsx`: add a second card/switch below the existing
   alarm-sound toggle, labeled "Show description in notifications", off by
   default, with a sub-label explaining the effect (description will appear
   in the lock screen / notification shade once enabled).

Default is **off** — consent means explicit opt-in, not opt-out.

## 7. App icon

**Findings from inspecting `icon.png` and `app.json`:**

- `icon.png` is a flat 1024×1024 RGB PNG (no alpha) with white padding and a
  rounded-square shape already baked in.
- It's reused for three purposes with different technical requirements:
  app icon, splash image, and the `expo-notifications` plugin's tray icon
  (`app.json` line 43).
- No `android.adaptiveIcon` config exists — Android re-masks the
  already-padded square, likely shrinking/off-centering the bell on many
  launchers.
- The notification tray icon must be a white silhouette on a **transparent**
  background; Android flattens any opaque pixels to a solid blob otherwise.
  Since `icon.png` has no alpha channel, the status-bar icon almost certainly
  renders as a plain blob today, not a bell.

**Scope for this pass:** technical/config fixes only, no new polished
artwork (that's a separate follow-up — current icon's visual quality/concept
still needs real design work later).

1. Generated `artifacts/mobile/assets/images/notification-icon.png`: a simple
   white bell silhouette on transparent background, 96×96, verified legible
   at both full size and downscaled to 24px (actual Android status-bar size).
2. Wire `expo-notifications` plugin's `icon` config in `app.json` to point at
   `notification-icon.png` instead of `icon.png`.
3. Add `android.adaptiveIcon` block to `app.json` using the existing
   `icon.png` as `foregroundImage` with an explicit `backgroundColor`, so
   Android's adaptive-icon masking behaves correctly instead of double-masking
   an already-padded square.

**Follow-up (not in this pass):** commission/generate a genuinely new,
higher-quality icon concept — current bell+checkmark is generic. Track as a
new backlog item once this pass lands.
