# 01 — What the app is

## One paragraph

**Reminders** (package `com.curios.remindme`) is a mobile app that schedules
reminders and fires local notifications. A user types or dictates a sentence
in plain language. The app extracts a title and a time from it, saves the
reminder on the device, and arms a notification. The app also sends a
reminder to another person. Everything else is optional.

## Who it is for

- A person who wants a reminder in one sentence, with no forms.
- A person who speaks or writes **Malayalam** as well as English.
- A person who wants to remind somebody else, by message or in-app.

## Design position

| Decision | Why |
| --- | --- |
| Reminders live on the device (AsyncStorage). No account. | Core use needs no server. A server adds cost, latency, and a privacy claim. |
| A backend exists, but only for "remind someone else". | See [ADR 0001](../adr/0001-client-talks-to-edge-functions-not-postgrest.md). |
| Statistics are **derived** from reminder records. No event log. | Two stores of one fact can disagree. The disagreement is not repairable later. |
| The app schedules **one-shot** notification triggers only. | A repeating OS trigger cannot carry this app's recurrence rules. |
| Malayalam is a first-class input, not a translation layer. | A separate parser and a separate font handle it. |

## The three product surfaces

1. **Core reminders** — create, edit, complete, snooze, repeat. Fully local.
2. **Remind someone else** — two tiers:
   - *Tier 1*: pick a contact, the app opens WhatsApp or SMS with a filled
     message. The sender's own phone also rings at the time.
   - *Tier 2*: app-to-app. The recipient gets a push and accepts or declines.
     This tier uses the Supabase backend.
3. **Insights** — completion rate, best and worst hours, tasks that slip.
   The app shows nothing that the sample size cannot support.

## Platform status

| Platform | State |
| --- | --- |
| Android | Primary target. Push (FCM) is live. Widgets are planned, not built. |
| iOS | The code paths exist. Tab bar uses `NativeTabs` on iOS 26. Not the focus. |
| Web | Not a product surface. |

## Language support

| Area | English | Malayalam |
| --- | --- | --- |
| Typed date/time parsing | Yes (`chrono-node`) | Yes (own parser) |
| Voice dictation | Yes (`en-US`) | Yes (`ml-IN`) |
| Recurrence rules | Yes | **No** — type-only today |
| Font rendering | Inter | Noto Sans Malayalam |
