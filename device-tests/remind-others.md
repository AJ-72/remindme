# Remind someone else — Tier 2 (app-to-app)

[← index](README.md)

Everything here is `BLOCKED` until the backend exists — there is no Supabase
project and no Edge Functions yet, so none of it can be run today — **except
D38**, which is pure on-device local storage and needs no backend at all.
The `BLOCKED` ones are written now because the design decisions they check
are being made now, and a check written after the fact tends to be a check
shaped to pass.

**Six of these need two handsets with two real phone numbers** — a setup cost
worth planning for rather than discovering. D32 needs a second person.

| ID | Scenario | Status | Last run | Auto? |
| --- | --- | --- | --- | --- |
| [D29](#d29) | Accepted reminder fires locally, survives reboot | `BLOCKED` | — | SEMI |
| [D34](#d34) | Verification ladder: link rung and OTP rung | `BLOCKED` | — | SEMI |
| [D35](#d35) | Invite token single-use, survives link preview | `BLOCKED` | — | SEMI |
| [D28](#d28) | Invitation arrives with the app killed | `BLOCKED` | — | SEMI |
| [D27](#d27) | Registration and the discoverability switch | `BLOCKED` | — | SEMI |
| [D30](#d30) | Block blocks, and unblock re-delivers nothing | `BLOCKED` | — | SEMI |
| [D31](#d31) | Expiry at the reminder's own time | `BLOCKED` | — | SEMI |
| [D32](#d32) | Concurrent cancel versus reschedule | `BLOCKED` | — | MANUAL |
| [D33](#d33) | Tier 1 fallback for an unreachable recipient | `BLOCKED` | — | SEMI |
| [D36](#d36) | Rebind on a new phone, and the 45-day cliff | `BLOCKED` | — | SEMI |
| [D37](#d37) | Cancel while the recipient is offline | `BLOCKED` | — | SEMI |
| [D38](#d38) | Device key persists across restart, absent on fresh install | `PENDING` | — | SEMI |

Highest-value first runs once the backend lands: **D34** (rung 1 shows no
verification screen at all — the claim the whole onboarding rests on),
**D35** (the WhatsApp link-preview token burn), and **D29** (offline firing
after reboot, which is what the mailbox architecture was bought for).

---

<a id="d27"></a>
## D27 — Registration and the discoverability switch · `BLOCKED`
The switch is the account. Off must mean **no row on the server and no network
traffic** — that is the constraint the whole opt-in model rests on, and it is
invisible from inside the app, so it has to be watched from outside.

**Setup.** Two devices, two numbers. Tier 2 build. Phone B freshly installed,
onboarding not yet completed.

**Steps.**
1. On B, reach the onboarding question and **decline**. Capture traffic
   (`adb logcat` for the app's own network logging, or a proxy).
2. On A, pick B from contacts and look at what the send screen says.
3. On B, Settings → turn **"Let people remind you"** on.
4. On A, pick B again.
5. On B, turn it back **off**.
6. On A, pick B a third time.

**Pass.**
- Step 1 sends **nothing** to the server. No user row is created.
- Step 2 shows the no-app path (per D33), not an error.
- Step 4 now shows B as reachable.
- Step 6 shows the no-app path again, and B's device token is gone server-side.

**Fails if.** A row appears for a user who declined — that is the single failure
this item exists to catch, and it silently voids the app's privacy claim. Also
fails if step 4 needs an app restart to take effect.

<a id="d28"></a>
## D28 — Invitation arrives with the app killed · `BLOCKED`
The whole feature is a push notification reaching a phone that is not running the
app. Jest cannot see any part of this.

**Setup.** Two devices. B registered and discoverable. **Swipe the app from
recents on B**, and leave the screen off.

**Steps.**
1. On A, create a reminder for B, one minute out, and send.
2. Watch B's lock screen without touching it.
3. Tap the notification on B — from cold start.
4. Read what A's screen shows before and after.

**Pass.** B's phone shows an invitation naming A within seconds, with the app
killed. The tap lands on an accept/decline screen with the reminder text and
time. A shows `Waiting` before and `Scheduled with them` after.

**Fails if.** Nothing arrives (check the Expo push receipt and the FCM token),
it arrives but the tap opens the home screen instead of the invitation, or the
notification body leaks the reminder text on a lock screen set to hide sensitive
content.

<a id="d29"></a>
## D29 — Accepted reminder fires locally, and survives a reboot · `BLOCKED`
**This is the claim that justifies the entire architecture.** The design chose
transfer-at-send-time specifically so an accepted reminder is a local
`AlarmManager` registration that does not depend on the server. If this fails,
the mailbox design bought nothing and the whole shape is wrong.

**Setup.** Two devices. An invitation from A accepted on B, for ~20 minutes out.

**Steps.**
1. On B, confirm the alarm is armed: `adb shell dumpsys alarm | grep -A5 remindme`.
2. **Put the phone in aeroplane mode.**
3. **Reboot B.**
4. Leave it offline and unplugged. Wait for the reminder.

**Pass.** It fires, on time, with no network at all. `dumpsys alarm` shows the
registration restored after the reboot (this is [D23](data-safety.md#d23)'s launch re-arm doing its
job on a transferred reminder).

**Fails if.** It needs connectivity to fire — which would mean the reminder is
being pushed at delivery time rather than scheduled locally, i.e. the
architecture was not built as specified.

<a id="d30"></a>
## D30 — Block blocks, and unblock re-delivers nothing · `BLOCKED`
Blocking is enforced server-side, so it must be verified from **the sender's
app**, not by reading the database. A block that only the UI honours is not a
block.

**Setup.** Two devices, A and B previously linked.

**Steps.**
1. On B, block A.
2. On A, send a reminder to B for ~30 minutes out.
3. Watch B. Wait a few minutes.
4. On B, unblock A.
5. Watch B again for several minutes. Do not send anything new.
6. On A, send a fresh reminder.

**Pass.** Step 2 tells A explicitly that B is not accepting reminders from them.
Step 3 delivers nothing to B. **Step 5 delivers nothing** — the reminder sent
during the block stays undelivered forever. Step 6 works normally.

**Fails if.** A is told the send succeeded (silent blocking was rejected by
design), or step 5 produces a surprise volley — the outcome this rule exists to
prevent.

<a id="d31"></a>
## D31 — Expiry at the reminder's own time · `BLOCKED`
An unaccepted 08:00 reminder is meaningless at 08:01. The sender being *told* is
the point: "I sent it and assumed it landed" is the failure this tier exists to
eliminate.

**Setup.** Two devices. B registered.

**Steps.**
1. On A, send B a reminder ~3 minutes out.
2. On B, **ignore it entirely.** Do not open the app.
3. Watch A from before the reminder time until a few minutes after.

**Pass.** At the reminder's datetime the invitation moves out of `Waiting` on
A's screen and A is told it expired unanswered. Server-side, the invitation's
`title`/`description` are now null (the retention rule).

**Fails if.** It sits in `Waiting` indefinitely, expires silently with no notice
to A, or B receives it late after expiry.

<a id="d32"></a>
## D32 — Concurrent cancel versus reschedule · `MANUAL`, `BLOCKED`
Two thumbs, same minute. No machine oracle — this is the one item in this file
that genuinely needs two people.

**Setup.** Two devices, an accepted reminder for ~1 hour out. Two humans, counting down together.

**Steps.**
1. On A, cancel. On B, reschedule to a different time. **Within the same few seconds.**
2. Read both screens.
3. Wait past both the original and the new time.

**Pass.** Cancel wins. B is told her change was discarded because the sender
cancelled. **Nothing rings on either phone at either time.**

**Fails if.** Anything fires — a cancelled appointment ringing anyway is the
harmful outcome this rule exists to prevent. Also fails if the winner depends on
which phone's clock is ahead; set one device's clock deliberately fast and repeat.

<a id="d33"></a>
## D33 — Tier 1 fallback for an unreachable recipient · `BLOCKED`
The recipient who declined and the recipient who never installed are
**indistinguishable to the app by design**. One message must serve both, and it
must work in Malayalam.

**Setup.** Three contacts: one who never installed, one who installed and
declined (from D27), and one reachable. Device language Malayalam for the second
pass.

**Steps.**
1. On A, pick each of the three and read what the pick-time notice says.
2. Send to the unreachable ones and read the composed message.
3. Repeat the whole pass with the app in Malayalam.
4. Send to the same unreachable contact four more times.

**Pass.** Contacts 1 and 2 behave identically and both get the Tier 1 WhatsApp
path. The message carries **both** the store link and the "already have it? turn
on Let people remind you" line. Functional strings render in Malayalam with the
Noto Sans Malayalam font, no tofu. On the 4th+ send the witty nudge is gone but
**the invite link is still present** — the cap split.

**Fails if.** The two unreachable contacts behave differently (that would mean
the app is storing decline state it should not have), the notice reappears on
every send to the same contact (per-contact memory), or the invite link
disappears with the nudge at the cap — which would strand that person
permanently.

<a id="d34"></a>
## D34 — Verification ladder: the link rung and the OTP rung · `BLOCKED`
Rung 1 exists so the older parent never sees a verification screen. If it shows
one, the ladder bought nothing and the feature lands back on the user least able
to complete it.

**Setup.** Two devices, two numbers. B has never bound a number. An SMS provider
account configured.

**Steps.**
1. On A, send B a reminder. B has no app - the Tier 1 message arrives.
2. On B, install and **tap the link in the WhatsApp message**. Watch every screen.
3. Separately, on a third install with no invite link, bind a number from Settings.

**Pass.** Step 2 shows **no OTP field and no verification screen at all** - B is
bound and discoverable purely by having tapped the link. Step 3 *does* show an
OTP field, and one SMS is sent and accepted.

**Fails if.** Step 2 asks for a code (rung 1 is not working, and finding #8 is
back), or step 3 binds without verification (finding #1 is back).

<a id="d35"></a>
## D35 — Invite token is single-use, and survives a link preview · `BLOCKED`
The token is a credential. The trap is that WhatsApp fetches URLs to build link
previews, so a token consumed on `GET` is burned before any human taps it - and
the symptom looks like "the invite link never works", nothing like a token bug.

**Setup.** Two devices. A can send to B.

**Steps.**
1. On A, send B an invite. **Watch the WhatsApp preview render** in the chat.
2. On B, tap the link and complete the claim.
3. On B, tap the **same link again**.
4. On a **third** device, tap that same link.

**Pass.** Step 1's preview does not consume the token. Step 2 succeeds. Step 3
succeeds **silently and idempotently** - same account, no error, no lockout.
Step 4 is **refused**.

**Fails if.** Step 2 fails after a preview rendered (the `GET`-consumption bug),
step 3 errors or locks B out (people really do tap twice), or step 4 succeeds -
which is finding #1 all over again.

<a id="d36"></a>
## D36 — Rebind on a new phone, and the 45-day cliff · `BLOCKED`
Rebind is a full account-takeover primitive gated on number control. The window
is the only thing bounding it, and the thing a stranger would inherit is a block
list.

**Setup.** An account on B with at least one block and one accepted link. A
second handset for the "new phone". Ability to age `last_active_at` in the
database, or to move the device clock.

**Steps.**
1. Migrate: install on the new handset, verify B's number by OTP.
2. Check the block list and links.
3. Check the old handset.
4. Age the account past **45 days** and repeat the rebind.

**Pass.** Step 1-2: account recovered **with** blocks and links - this is the
legitimate migration path and it must not lose data. Step 3: the old device's
token is revoked and it shows "your account was recovered on a new device".
Step 4: a **fresh, empty** account; the old row, its blocks, links and pending
invitations are gone.

**Fails if.** Step 2 loses the block list (migration punished to defend against
recycling - the two are indistinguishable, which is what the window is for), or
step 4 recovers the old account (a recycled number inheriting a stranger's
blocks).

<a id="d37"></a>
## D37 — Cancel while the recipient is offline · `BLOCKED`
This verifies the **honest** behaviour, not the absolute claim the first draft
made. A cancelled reminder *may* fire on an offline device; what must not happen
is that the notification then lingers, or that the alarm is delayed by a network
call.

**Setup.** Two devices. An accepted reminder on B, ~10 minutes out. B in
aeroplane mode.

**Steps.**
1. On A, cancel.
2. Leave B offline through the reminder time. Record delivery time to the ms via
   `logcat -s AlarmManager`.
3. Bring B back online.

**Pass.** Step 2: it fires, **on time** - punctuality is not traded away. Step 3:
within seconds of connectivity the notification is dismissed and the reminder is
marked cancelled. A's copy shows cancelled throughout.

**Fails if.** The alarm is **late** (a blocking network check was added at alarm
time - the thing this design explicitly refuses), or the notification survives
reconnection, or B's copy stays live.

<a id="d38"></a>
## D38 — Device key persists across restart, absent on fresh install · `PENDING`
T0.2/T0.3 (`services/DeviceIdentityService.ts`, `services/SessionService.ts`).
Unlike the rest of this file, **this one needs no backend** - it's pure
`expo-secure-store`, and Jest's manual mock of it (an in-memory `Map`) cannot
prove the real native keystore-backed implementation behaves the same way on
hardware. Run this as soon as a dev-client build with these files exists;
don't wait for the rest of Tier 2.

**Setup.** A dev-client build with `expo-secure-store` linked. No account, no
binding UI exists yet - this checks the key alone.

**Steps.**
1. Fresh install. Before anything else runs, confirm no device key exists
   (log it once from `app/_layout.tsx` during development, or inspect via
   `adb shell` if rooted/emulator).
2. Launch the app once - `getOrCreateDeviceKey()` should run and generate a
   key. Record it.
3. Force-stop the app (not just background it) and relaunch.
4. Uninstall and reinstall the app, then launch again.

**Pass.** Step 2 generates a key. Step 3's key is **identical** to step 2's -
survives an app restart. Step 4's key is **different** from step 2/3's -
absent on a fresh install, because SecureStore's backing keystore entry does
not survive an uninstall.

**Fails if.** The key changes across an ordinary restart (something is
regenerating it instead of reading what's stored - Jest's concurrency test
for this passes and would not catch a real double-write racing SecureStore's
actual native call), or it survives an uninstall (would mean it leaked into
something like Android Auto Backup, which is a privacy problem for an
identity key - see `docs/superpowers/specs/2026-08-30-remind-someone-else-tier2-design.md`,
"An account is not a bound phone number").
