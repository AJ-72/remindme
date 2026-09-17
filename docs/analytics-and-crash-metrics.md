# Usage and crash metrics

What this app measures, why each number exists, and what it costs.

Written for the app's owner, not for a dashboard. Every metric below is here
because a specific decision turns on it. A metric nobody would act on is not a
metric, it is a chart, and charts nobody acts on are the reason analytics
projects rot.

---

## 1. The choice of tools, and what it costs

| | PostHog | Sentry |
|---|---|---|
| Job | Product analytics — what people do, and whether they come back | Crashes and handled errors, with readable JavaScript stack traces |
| Free tier | 1M events, 5k session replays, 100k error logs, 1M feature-flag requests / month | 5k errors / month, 1 user, 30-day retention |
| First paid step | $0.00005 per event above 1M | $26 / month (Team, 50k errors) |
| Expected cost at 1,000 monthly users | **$0** | **$0**, with one caveat below |

**Sizing.** At roughly 1,000 monthly active users and 20 events per user per
day, this app generates about 600,000 events a month — inside PostHog's free
tier with room to grow. The event vocabulary in `constants/analytics.ts` is
closed and small precisely to keep it there.

**The one real cost risk is Sentry, not PostHog.** 5,000 errors a month sounds
generous until one bad release puts a crash inside a render loop: a single
device can then produce thousands of reports in an hour. Two mitigations are in
place — `beforeSend` drops everything when the user has opted out, and tracing
is sampled at 5% — but if a release ever blows the quota, the $26 Team plan is
the correct response, not turning reporting off.

### Why not Firebase, given a Firebase project already exists for push

Firebase Analytics and Crashlytics are free with no event cap, which is a real
advantage. They lose on two points that matter more here:

- **Firebase Analytics gives counts, not answers.** Funnels you did not define
  in advance, per-user timelines, and cohort retention all need a BigQuery
  export before they are possible at all. Reports lag up to 24 hours. Event
  names are capped at 500 distinct values with 25 parameters each. PostHog
  answers new questions about data already collected; that is the whole point.
- **Crashlytics cannot read this app's crashes.** This is a React Native app,
  so most defects are JavaScript defects. Crashlytics reports a JS error as a
  minified frame with no usable file or line. Sentry's Expo integration uploads
  source maps with each EAS build, so the report names the real file.

PostHog + Crashlytics was considered and rejected: it still requires the native
Firebase module (so no work is saved) while giving up the readable stack traces
that were the reason to add crash reporting at all.

---

## 2. The metrics, grouped by the question they answer

### 2.1 Is the app being used at all?

| Metric | Source | Acts on |
|---|---|---|
| Daily / monthly active installs | PostHog, automatic | Whether anything else on this list is worth reading |
| New installs per week | PostHog, automatic | Whether a store listing or a share link is working |
| **Day-7 and day-30 retention** | PostHog retention, on `reminder_created` | The single most honest measure of whether this app is useful. A reminder app people stop opening has failed, whatever its ratings say |
| Sessions per active user per week | PostHog, automatic | A reminder app should be opened often and briefly. A falling number with flat retention means notifications are doing the work, which is good |

### 2.2 Does the core loop complete?

This is the funnel that matters: **open → create → get alerted → complete**.

| Metric | Source | Acts on |
|---|---|---|
| `reminder_created` per active user | Event | Whether creation is easy enough to be habitual |
| Creation funnel drop-off | PostHog funnel: `$screen` add-reminder → `reminder_created` | People who open the add screen and leave without saving are hitting friction. A high drop here is a UI bug, not a taste problem |
| **Completion rate** | `reminder_completed` ÷ `reminder_created` | The product's actual success rate. Note the app already computes this per-user locally (`utils/adherenceStats.ts`); the event version is what makes it comparable across installs and releases |
| On-time rate | `reminder_completed.on_time` | Separates "they did it" from "they did it when asked". A falling on-time rate with a steady completion rate usually means alerts are arriving late |
| Snoozes per reminder | `reminder_snoozed` | Deliberate postponement — the avoidance signal already instrumented on the record |
| Abandonment | `reminder_deleted.was_completed = false` | Deleting an unfinished reminder is a different act from clearing a finished one. Rising abandonment is the early warning that the app is being used as a wish list, not a tool |

### 2.3 Did the alert actually arrive?

The hardest and most valuable question in this app, and the one the local data
genuinely cannot answer.

| Metric | Source | Acts on |
|---|---|---|
| `notification_opened` per scheduled reminder | Event, with `launch: cold_start \| foreground` | Whether notifications are reaching the device at all. This is the only signal that distinguishes "never fired" from "fired and ignored" — two failures with opposite fixes |
| Notification action mix | `notification_opened.action` | Whether the tray's Done and Snooze buttons earn their space |
| Permission outcomes | `permission_result` | Notification permission refused means the app cannot do its job. If this is high, the timing of the ask is wrong |
| Exact-alarm availability | `permission_result`, Android | A device that denies exact alarms delivers late. Correlate with the on-time rate above before blaming the scheduling code |

**Known limit, stated plainly:** an alert delivered to a fully killed app's
tray and swiped away produces no event at all — the received-listener only runs
while the process lives (CLAUDE.md records the same limit for `notifiedAt`).
So a low `notification_opened` rate is evidence of a delivery problem, never
proof of one.

### 2.4 Which features earn their complexity?

Each of these represents a large amount of code. The metric decides whether it
stays.

| Metric | Source | Acts on |
|---|---|---|
| Dictation attempt rate | `dictation_started` per active user | Whether voice entry is discovered at all |
| **Dictation success rate** | `dictation_completed.got_text` | The failure users actually hit is silent: the mic closes and the field is empty, with no error. Counted separately for exactly that reason |
| Dictation failures by code | `dictation_failed.code` | Distinguishes a missing offline model from a recognizer error |
| Malayalam share of content | `script` on every reminder event | Whether the Malayalam parser and font work serve a real population, and whether Malayalam users complete reminders at the same rate as English ones. If they do not, that gap is a bug |
| Share-intent use | `share_intent_received` | Whether the WhatsApp-to-reminder path is used enough to keep maintaining |
| Insights screen views | `insights_viewed`, with `has_rate` | A user who opens "How you're doing" and finds every figure blanked for want of data has had a wasted trip. That is a thresholds-and-copy problem, not a demand problem |
| Tier 2 adoption | `invitation_sent`, `invitation_responded`, `for_someone_else` | The largest feature in the app by build cost. Its funnel: sent → responded, split by accept/decline and by whether the recipient moved the time |
| Backup use | `backup_exported` / `backup_imported` | Reminders live only in AsyncStorage. Low export use plus any reinstall means silent data loss for real people |

### 2.5 Is the app healthy?

| Metric | Source | Acts on |
|---|---|---|
| **Crash-free user rate, per release** | Sentry release health | The one number to check after every release. A drop is a rollback decision |
| Crash-free session rate | Sentry | Same signal, more sensitive |
| New issues introduced per release | Sentry, grouped by release | Catches a regression before the store reviews do |
| Handled-error volume | `captureHandledError` call sites | The more valuable half. A swallowed failure — a notification that never scheduled, a transcription that returned nothing — is invisible to users and to you without this |
| Errors by Android version / OEM | Sentry tags | OEM power managers are a recurring source of missed alarms. This is how you prove it |

### 2.6 The honesty metric

| Metric | Source | Acts on |
|---|---|---|
| `telemetry_opt_out` rate | Event, captured while consent still stands | If a meaningful share of users turn this off, the bargain is not being accepted, and the answer is to collect less — not to ask more insistently |

---

## 3. What is never collected

By construction, not by policy:

- **No reminder titles or descriptions.** `AnalyticsProps` accepts only
  primitives, so passing a whole reminder object does not compile. Properties
  are built by `utils/analyticsProps.ts`, which reports shape and timing only.
- **No phone numbers, contacts or recipient names.** `for_someone_else` is a
  boolean.
- **No dictated text.** `SpeechService` reports the locale and whether any text
  came back, never the text.
- **No screenshots, no session replay, no view hierarchy.** Sentry is
  configured with all three off, and they are not settings.
- **Crash reports are scrubbed before sending.** `scrubEvent()` drops the user
  object and request bodies, and redacts any string holding Malayalam script
  (in this app, always user content) or a phone-number shape. This catches the
  realistic leak: an exception message that interpolated a reminder title.
- **Identity is a random uuid this device generated for itself**
  (`DeviceIdentityService`), tied to no account and no phone number.

The user can turn all of it off in **Settings → Privacy → Help improve this
app**. Opting out stops the next event and drops whatever is queued unsent.

---

## 4. Setting it up

Both services no-op without credentials. That is the intended state for local
development and for the Jest suite: nothing is constructed, nothing is sent.

1. Create a PostHog project and a Sentry project (React Native platform).
2. Set these as EAS environment variables (Expo dashboard → Environment
   variables), plain visibility — they ship inside the APK either way:
   - `EXPO_PUBLIC_POSTHOG_KEY`
   - `EXPO_PUBLIC_POSTHOG_HOST` — only if using EU cloud
     (`https://eu.i.posthog.com`)
   - `EXPO_PUBLIC_SENTRY_DSN`
3. For readable stack traces, also set, as **secrets**:
   - `SENTRY_ORG`, `SENTRY_PROJECT`
   - `SENTRY_AUTH_TOKEN` — a write credential for your Sentry org. Unlike the
     DSN this is a real secret and must never be committed.

   `app.config.js` adds Sentry's Expo plugin only when `SENTRY_ORG` and
   `SENTRY_PROJECT` are both present, so a local build without them still
   works — it just reports minified frames.
4. Rebuild natively (`expo prebuild` then a full build). Both packages contain
   native code; a Metro reload is not enough.

### Before you trust the first dashboard

Point a debug build at a **throwaway** PostHog project first. Real usage data
mixed with a week of your own testing is not recoverable after the fact, and
every retention figure computed over it will be wrong in a direction you cannot
estimate.

---

## 5. What is wired today, and what is not

**Every event in `constants/analytics.ts` has a real emitter**, and
`constants/analytics.test.ts` fails the build if one stops having one — the
guard exists because a catalogued event with no call site renders a chart that
reads zero forever and gets believed.

Three of the four wired last have a call site worth knowing about:

- `nl_parse_result` fires at **save**, not at parse. The natural-language
  parser runs on every keystroke, so tracking it where it happens would send
  one event per character typed and drown every other series in the project.
- `number_registered` fires on **both** paths that prove number ownership —
  self-registration and an invite link — separated by a `method` property, and
  carries how many stranded invitations that registration released. That count
  is the exact bug found live-testing on two devices (CLAUDE.md), now measured
  rather than rediscovered.
- `setting_changed` is one event with a `setting` name and a `value`, not one
  event per switch. Free-text settings are absent from every call site: "Your
  name" is never sent, and quiet hours report only whether the user moved the
  window off its default, never the window — that is close to a sleep
  schedule.

Nothing in this file has been verified against a live PostHog or Sentry
project. The code is covered by unit tests (opt-out behaviour, scrubbing,
property construction) and the whole mobile suite passes, but a first real
build must confirm that events actually arrive and that stack traces
de-minify. See `device-tests/` for those checks.
