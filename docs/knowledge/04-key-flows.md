# 04 — Key flows

Six flows cover most of the app. Each one names the files it passes through.

## 1. Create a reminder from a sentence

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/04-key-flows-1-dark.svg">
  <img alt="1. Create a reminder from a sentence — diagram" src="diagrams/04-key-flows-1-light.svg">
</picture>

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
sequenceDiagram
    actor U as User
    participant QA as QuickAddInput
    participant P as parseNaturalLanguage
    participant ML as malayalamDateParser
    participant CH as chrono-node
    participant CX as RemindersContext
    participant RS as ReminderService
    participant AS as AsyncStorage
    participant OS as expo-notifications

    U->>QA: types or dictates text
    QA->>P: parse(text) on each keystroke
    P->>P: MALAYALAM_RANGE test
    alt Malayalam script
        P->>ML: parse
    else English
        P->>CH: parse
    end
    P-->>QA: { title, datetime, recurrence? }
    QA-->>U: live preview
    U->>QA: Save
    QA->>CX: addReminder(data)
    CX->>RS: addReminder
    RS->>OS: scheduleNotification (one-shot DATE trigger)
    OS-->>RS: notificationId
    RS->>AS: save full array
    RS-->>CX: Reminder
    CX-->>QA: navigate back
```

</details>

Notes:
- The parser runs on **every keystroke**. This is why the `nl_parse_result`
  analytics event fires at save, not at parse.
- The channel is chosen by `channelIdForAlarm(alarm, vibrate)`.
- `exactTiming` decides whether the trigger is alarm-clock backed.

## 2. A notification fires and the user acts

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/04-key-flows-2-dark.svg">
  <img alt="2. A notification fires and the user acts — diagram" src="diagrams/04-key-flows-2-light.svg">
</picture>

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
sequenceDiagram
    participant OS as OS tray
    participant NRH as NotificationResponseHandler
    participant H as notificationResponseHandler.ts
    participant RS as ReminderService
    participant R as Expo Router

    OS->>NRH: received (app alive only)
    NRH->>RS: markNotifiedById → notifiedAt
    OS->>NRH: user taps or picks an action
    NRH->>H: handleResponse(deps)
    alt MARK_DONE
        H->>RS: toggleComplete
    else SNOOZE_10 / SNOOZE_MORE
        H->>RS: snoozeReminder(preset)
        RS->>RS: push snoozeHistory, ++snoozeCount
        RS->>OS: schedule a new one-shot
    else plain tap
        H->>R: navigate reminder-detail
        R->>RS: markOpened → openedAt
    end
```

</details>

Important limit: `addNotificationReceivedListener` only fires while the app
process is alive. A notification delivered to a killed app's tray leaves no
`notifiedAt`. This stamp is evidence a notification fired. It is not proof it
was the only time.

## 3. A recurring series moves forward

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/04-key-flows-3-dark.svg">
  <img alt="3. A recurring series moves forward — diagram" src="diagrams/04-key-flows-3-light.svg">
</picture>

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
flowchart TB
    A["Trigger 1: notification received<br/>(app alive)"] --> C
    B["Trigger 2: rescheduleAllFutureReminders<br/>on boot or provider mount"] --> C
    C{"isRecurring(r)<br/>and datetime is past?"}
    C -->|no| Z["leave as is"]
    C -->|yes| D["tally the retiring occurrence into<br/>occurrencesCompleted / occurrencesMissed"]
    D --> E["computeNthOccurrence(recurrenceAnchor, n)<br/>fresh from the anchor, never chained"]
    E --> F["reset currentOccurrenceSnoozes = 0"]
    F --> G["arm a new one-shot DATE trigger"]
    G --> C

    style E fill:#6b3d3d,color:#fff
```

</details>

Two rules the tests pin:

1. **Compute every candidate fresh from `recurrenceAnchor`.** Chaining
   forward compounds the day-of-month clamp. Jan 31 caught up three months
   by chaining lands on Apr 28. The correct answer is Apr 30.
2. **Never compute from `datetime`.** A snooze has moved it.

The boot sweep is what covers a killed app. It catches up several missed
occurrences in one pass.

## 4. Intake from another app

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/04-key-flows-4-dark.svg">
  <img alt="4. Intake from another app — diagram" src="diagrams/04-key-flows-4-light.svg">
</picture>

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
flowchart LR
    subgraph Sources
        S1["Share sheet<br/>(expo-share-intent)"]
        S2["Text selection menu<br/>ACTION_PROCESS_TEXT"]
        S3["Shared audio<br/>e.g. WhatsApp voice note"]
    end

    S1 --> SC["SharedTextContext"]
    S2 --> PT["modules/process-text<br/>(native, reads Intent extra)"] --> SC
    S3 --> SC
    SC -->|audio| SP["SpeechService.transcribeAudioFile<br/>language read fresh at call time"]
    SP --> SC
    SC -->|sharedText channel| QA["QuickAddInput"]

    style PT fill:#6b3d3d,color:#fff
```

</details>

Why a native module: the selected text arrives as an Intent **extra**. React
Native's Linking API cannot read an extra. The module consumes the intent
after reading it, so a rotation does not re-insert handled text.

Why the language is read fresh from `ReminderService.getDictationLanguage()`
and not from a prop: a cold start would otherwise use a stale closure.

## 5. Remind someone else — Tier 1

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/04-key-flows-5-dark.svg">
  <img alt="5. Remind someone else — Tier 1 — diagram" src="diagrams/04-key-flows-5-light.svg">
</picture>

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
sequenceDiagram
    actor U as Sender
    participant SR as send-reminder.tsx
    participant CS as ContactsService
    participant ML as messageLinks.ts
    participant RS as ReminderService

    U->>SR: pick a contact
    SR->>CS: read contact
    SR->>RS: save a local reminder with `recipient`
    Note over RS: the sender's own phone rings at the time
    SR->>ML: build a WhatsApp or SMS deep link
    ML-->>U: messaging app opens, text pre-filled
    Note over SR: app invite appended, capped at 3 per person
```

</details>

No backend. No account. This tier works offline apart from the message.

## 6. Remind someone else — Tier 2 (app to app)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/04-key-flows-6-dark.svg">
  <img alt="6. Remind someone else — Tier 2 (app to app) — diagram" src="diagrams/04-key-flows-6-light.svg">
</picture>

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
sequenceDiagram
    actor S as Sender
    participant APP as App
    participant LK as lookup fn
    participant SI as send-invitation fn
    participant PG as Postgres
    participant EX as Expo push → FCM
    actor R as Recipient
    participant CI as claim-invitations fn
    participant RI as respond-invitation fn

    S->>APP: pick a contact
    APP->>LK: hashed number (HMAC pepper, server side)
    LK->>PG: hash_lookup() + rate limit
    LK-->>APP: reachable or not
    S->>APP: send
    APP->>SI: create invitation
    SI->>PG: send_invitation() — block check + 30-day cap
    SI->>EX: push every registered device (best effort)
    EX-->>R: "S sent you a reminder"
    R->>APP: opens app / authenticates
    APP->>CI: claim_invitations() reads auth.uid() itself
    CI-->>APP: pending invitations
    R->>APP: accept or decline
    APP->>RI: respond_to_invitation()
    RI->>PG: write outcome
    Note over R: on accept, a local Reminder is created<br/>carrying senderName and any recurrence rule
```

</details>

Facts worth holding:

- A missing or dead push token never fails the send. The recipient still
  collects the invitation on next auth through `claim-invitations`.
- `claim_invitations()` accepts **no** caller-supplied identity. It reads
  `auth.uid()`'s own row.
- `invitations.bind_token` is the verification credential. Possessing the
  link is the proof. Consumption is tracked on `bound_by` / `bound_at`, not
  inferred from `users.phone_hash` — an account is deletable, so a proxy
  inferred from it dies with the account.
- `PHONE_HASH_PEPPER` **must never be rotated.** Every stored `phone_hash`
  depends on it. Rotation breaks all matching silently, with no error.
- `expire-invitations-cron` runs hourly through `pg_cron` + `pg_net`, with
  its secret pulled from Supabase Vault, not embedded in the job SQL.

## 7. Where statistics come from

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/04-key-flows-7-dark.svg">
  <img alt="7. Where statistics come from — diagram" src="diagrams/04-key-flows-7-light.svg">
</picture>

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
flowchart LR
    R[("Reminder records<br/>createdAt · completedAt<br/>snoozeCount · snoozeHistory<br/>originalDatetime · notifiedAt · openedAt")]
    R --> AST["adherenceStats.ts"]
    AST -->|below the floor| NULL["null"]
    AST -->|enough sample| NUM["a number"]
    NULL --> AC["adherenceCopy.ts<br/>em dash + what is missing"]
    NUM --> AC
    AC --> I["insights.tsx"]
    AC --> B["save-time banner in add-reminder.tsx"]
    AC --> D["postponement panel in reminder-detail.tsx"]

    style NULL fill:#6b3d3d,color:#fff
```

</details>

There is **no event log**, deliberately. Accepted costs: a notification the
user swiped away is invisible, and deleting a reminder deletes its history.

`suggestBetterHour()` stays silent unless it has evidence **against** the
hour the user picked. Absence of data is not an argument for moving somebody's
reminder.
