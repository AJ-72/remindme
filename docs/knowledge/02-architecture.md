# 02 — Architecture

All diagrams are Mermaid. GitHub renders them. An agent reads the source
directly.

## 1. System context

Who talks to what.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/02-architecture-1-dark.svg">
  <img alt="1. System context — diagram" src="diagrams/02-architecture-1-light.svg">
</picture>

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
graph TB
    subgraph Device["Android / iOS device"]
        APP["Reminders app<br/>React Native + Expo Router"]
        AS[("AsyncStorage<br/>all reminders + settings")]
        OS["OS notification scheduler<br/>expo-notifications"]
        STT["Speech recognition"]
        CONTACTS["Contacts"]
    end

    subgraph Cloud["Supabase project remindme-tier2"]
        EF["Edge Functions (Deno)"]
        PG[("Postgres<br/>6 tables + RLS<br/>+ SECURITY DEFINER fns")]
    end

    subgraph Ext["Third parties"]
        EXPO["Expo Push service<br/>then FCM"]
        VENDOR["PostHog · Sentry<br/>opt-out, no user content"]
        MSG["WhatsApp / SMS<br/>deep link only"]
    end

    APP --- AS
    APP --- OS
    APP --- STT
    APP --- CONTACTS
    APP -->|HTTPS, user JWT| EF
    EF --> PG
    EF -->|push token| EXPO
    EXPO -->|notification| APP
    APP --> VENDOR
    APP --> MSG

    style APP fill:#2d5f8a,color:#fff
    style PG fill:#3d6b4a,color:#fff
    style EF fill:#3d6b4a,color:#fff
    style AS fill:#7a5c2e,color:#fff
```

</details>

**Read this first:** the app never calls Postgres or PostREST directly. Every
backend call goes through an Edge Function. That is [ADR 0001](../adr/0001-client-talks-to-edge-functions-not-postgrest.md).

## 2. Monorepo layout

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/02-architecture-2-dark.svg">
  <img alt="2. Monorepo layout — diagram" src="diagrams/02-architecture-2-light.svg">
</picture>

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
graph LR
    ROOT["remindme/ (pnpm workspace)"]

    ROOT --> ART["artifacts/"]
    ROOT --> LIB["lib/"]
    ROOT --> SUP["supabase/functions/"]
    ROOT --> DOCS["docs/ · backlog.md · device-tests/"]
    ROOT --> E2E["Maestro/ · scripts/"]

    ART --> MOB["mobile/ ← the product"]
    ART --> API["api-server/ (1 health route,<br/>slated for deletion)"]
    ART --> MOCK["mockup-sandbox/"]

    LIB --> DB["db/ — Drizzle schema,<br/>SQL functions, RLS tests"]
    LIB --> SPEC["api-spec/ — openapi.yaml"]
    LIB --> GEN["api-client-react/ · api-zod/<br/>(generated, do not edit)"]

    style MOB fill:#2d5f8a,color:#fff
    style DB fill:#3d6b4a,color:#fff
    style API fill:#6b3d3d,color:#fff
```

</details>

`artifacts/api-server`, `lib/api-spec`, `lib/api-client-react` and
`lib/api-zod` are a working pipeline with nothing flowing through it. Do not
assume the mobile app uses them. It does not.

## 3. Mobile layers

The rule: **screens never touch storage or the OS. Services do.**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/02-architecture-3-dark.svg">
  <img alt="3. Mobile layers — diagram" src="diagrams/02-architecture-3-light.svg">
</picture>

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
graph TB
    subgraph L1["Screens — app/"]
        S1["(tabs)/index · settings · about"]
        S2["add-reminder · reminder-detail"]
        S3["send-reminder · invitation-preview<br/>pending-invitations · register-number · bind-invite"]
        S4["insights · smart-alerts · why-tasks-slip · backup"]
    end

    subgraph L2["Components — components/"]
        C1["QuickAddInput · ReminderCard<br/>RecurrencePicker · SnoozeSheet · …"]
    end

    subgraph L3["Contexts — contexts/"]
        X1["RemindersContext"]
        X2["SharedTextContext"]
        X3["ThemeContext · TourContext"]
    end

    subgraph L4["Services — services/"]
        V1["ReminderService<br/>storage · settings · notifications"]
        V2["SpeechService"]
        V3["InvitationService · RecipientLookupService<br/>SessionService · OtpService<br/>DeviceRegistrationService"]
        V4["AnalyticsService · CrashReportingService"]
    end

    subgraph L5["Pure utils — utils/"]
        U1["parseNaturalLanguage · malayalamDateParser"]
        U2["recurrence · adherenceStats · quietHours"]
        U3["phoneNumber · getFontFamily · formatDatetime"]
    end

    L1 --> L2
    L1 --> L3
    L2 --> L3
    L3 --> L4
    L1 --> L5
    L2 --> L5
    L4 --> L5

    style L4 fill:#3d6b4a,color:#fff
    style L5 fill:#7a5c2e,color:#fff
```

</details>

Layer rules, in order of importance:

1. `ReminderService.ts` is the **only** module that reads or writes
   AsyncStorage and the only one that calls `expo-notifications`.
2. Screens call `useReminders()`. Screens do not import `ReminderService`.
3. `utils/` is pure. No storage, no network, no React. This is why the
   parsers and statistics have heavy test coverage.

## 4. Provider tree

The nesting order is load-bearing. Getting it wrong throws at render time.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/02-architecture-4-dark.svg">
  <img alt="4. Provider tree — diagram" src="diagrams/02-architecture-4-light.svg">
</picture>

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
graph TB
    A["SafeAreaProvider"] --> B["ThemeProvider"]
    B --> C["QueryClientProvider"]
    C --> D["KeyboardProvider"]
    D --> E["RemindersProvider"]
    E --> F["TourProvider"]
    F --> G["SharedTextProvider"]
    G --> H["Expo Router Stack"]

    style E fill:#2d5f8a,color:#fff
    style G fill:#2d5f8a,color:#fff
```

</details>

`SharedTextProvider` reads settings through `useReminders()`. It must sit
**inside** `RemindersProvider`. This exact mistake has broken three test
files. Copy the order above into any test that renders both.

## 5. Backend

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/02-architecture-5-dark.svg">
  <img alt="5. Backend — diagram" src="diagrams/02-architecture-5-light.svg">
</picture>

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
graph TB
    subgraph Client
        M["Mobile app<br/>(anon key + user JWT)"]
    end

    subgraph EF["Edge Functions — supabase/functions/"]
        F1["lookup — is this number reachable?"]
        F2["self-register"]
        F3["send-invitation"]
        F4["claim-invitations"]
        F5["respond-invitation"]
        F6["expire-invitations-cron<br/>(no user JWT · x-cron-secret)"]
    end

    subgraph SH["_shared/"]
        H1["supabaseClient · cors · errors<br/>expoPush · phoneHash"]
    end

    subgraph DB["Postgres"]
        T["users · devices · invitations<br/>blocks · link_codes · lookup_rate_limits"]
        FN["SECURITY DEFINER functions<br/>send_invitation · claim_invitations<br/>bind_via_invite_token · respond_to_invitation<br/>hash_lookup · self_register · …"]
        RLS["RLS policies (pgPolicy)<br/>+ privileges.sql grants"]
    end

    M --> F1 & F2 & F3 & F4 & F5
    F1 & F2 & F3 & F4 & F5 & F6 --> H1
    F1 & F2 & F3 & F4 & F5 & F6 --> FN
    FN --> T
    RLS -.guards.-> T
    F3 --> PUSH["Expo push → FCM"]
    CRON["pg_cron hourly<br/>secret from Vault"] --> F6

    style FN fill:#6b3d3d,color:#fff
    style RLS fill:#3d6b4a,color:#fff
```

</details>

Three facts that catch people:

- **A new table with no `pgPolicy` has RLS off.** Drizzle enables RLS only on
  tables that declare a policy. A test asserts `tablesWithoutRls()` is empty.
- **`drizzle-kit push` does not apply functions or grants.** `push:sql` is a
  second, required step. Run both, every time.
- **`SECURITY DEFINER` functions bypass RLS.** That is deliberate. They take
  no argument the caller can lie about, pin `search_path`, schema-qualify
  every name, and revoke from `public`, `anon` **and** `authenticated` by
  name.

## 6. Data model on the device

One `Reminder` record carries everything. There is no second table.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/02-architecture-6-dark.svg">
  <img alt="6. Data model on the device — diagram" src="diagrams/02-architecture-6-light.svg">
</picture>

<details>
<summary>Diagram source (Mermaid)</summary>

```mermaid
classDiagram
    class Reminder {
        id · title · description
        datetime · completed · alarm
        exactTiming · notificationId
        --- adherence ---
        createdAt · completedAt
        snoozeCount · originalDatetime
        snoozeHistory[] · notifiedAt · openedAt
        --- recurrence ---
        recurrence · recurrenceAnchor
        occurrencesCompleted · occurrencesMissed
        currentOccurrenceSnoozes
        --- tier 2 ---
        recipient · senderName · senderId
        invitationId · recipientTimeChange
    }
    class RecurrenceRule {
        freq: daily|weekly|monthly|yearly
        interval: number
        byWeekday?: number[]
    }
    class ReminderRecipient {
        name · phone · contactId
        appUserId? · lookedUpAt?
    }
    Reminder --> RecurrenceRule
    Reminder --> ReminderRecipient
```

</details>

Three fields hold three different times. Do not mix them:

| Field | Meaning | Who moves it |
| --- | --- | --- |
| `datetime` | When this occurrence fires now. | A snooze, an edit, an advance. |
| `originalDatetime` | The first time it ever had. | Set once, on first snooze. |
| `recurrenceAnchor` | What "every day at 8" means. | A deliberate time edit only. **Never a snooze.** |

Statistics bucket by `originalDatetime ?? datetime`. Recurrence computes from
`recurrenceAnchor`. Both rules exist because a snooze overwrites `datetime`.
