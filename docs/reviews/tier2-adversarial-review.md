# Tier 2 design — adversarial review findings

Source spec: `docs/superpowers/specs/2026-08-30-remind-someone-else-tier2-design.md`
Reviewer: adversarial pass, 2026-08-30
Instruction to the agent: treat each row as a spec defect. Resolve or record an explicit rejection with a reason in the spec.

| # | Area | Finding | Why it matters | Proposed fix | Priority | Blocks build step |
|---|------|---------|----------------|--------------|----------|-------------------|
| 1 | Security | Number takeover. Registration is unverified, and registration self-claims all pending invitations for that phone hash. | An attacker who knows a target number collects that target's reminders before the target installs. This defeats accept-first. | Either add OTP, or stop auto-claim: show claimed invitations as new requests with the send time and sender name, and require a separate accept. | P0 | 4 |
| 2 | Engineering | Cancel cannot be enforced. The reminder is armed locally, so a cancel needs a push to reach the device. | "Cancel always wins" is the strongest promise in the spec and it is not enforceable when the device is offline. | Check the server at alarm time with a short timeout. Fire the alarm if the check fails. Record the honest limit in the spec. | P0 | 5, 8 |
| 3 | Engineering | Device-key identity has no recovery path. Backup is a pasted JSON blob. | A reinstall loses the identity, and with it all links, blocks and accepted state. The spec rejects E2E for this same reason. | Define reinstall behaviour before any table exists. Decide whether the phone hash re-binds the old account. | P0 | 1, 2 |
| 4 | Security | Abusive content is delivered inside the invitation itself. | Accept-first stops scheduling, not delivery of text. The first contact is an open channel. | Show only sender name and time for a first-contact invitation. Reveal the text after accept. | P1 | 4, 5 |
| 5 | Security | Lookup rate limit is per account, but accounts are free and unverified. | An attacker makes many accounts and divides the number space. The pepper protects a leaked table, not the oracle. | Add device-level and global limits, a daily contact cap, and logging of high-volume lookups. | P1 | 3 |
| 6 | Security | Expiry equals the reminder datetime, so a far-future datetime keeps the row for months. | The mailbox is not self-cleaning, which breaks the stated retention policy. | Add an absolute maximum age, for example 30 days, independent of the datetime. | P1 | 1, 4 |
| 7 | Product | Discoverability is one switch with three jobs: account, discovery, and global mute. | A user who wants to hide from one person must switch off everything. A user who wants no account must accept no reminders. | Separate the three concerns into distinct settings. | P1 | 2 |
| 8 | Product | The core user (an older parent) must install the app and then find and turn on a settings switch. | The feature works only after the step that user is least able to complete, and the sender cannot do it for them. | Turn discoverability on by default after install, with accept-first as the protection. Test onboarding with a real target user first. | P1 | 2 |
| 9 | Engineering | Build order step 1 hides the identity and authentication work. The repo has zero tables and no auth boundary. | The schedule is optimistic. Step 1 is a whole subsystem, not a schema. | Add a step 0: authentication, session handling, and device key storage. | P1 | 1 |
| 10 | Security | A block is disclosed to the sender, and the sender can then use the Tier 1 SMS or WhatsApp path. | The user may believe a block stops contact. It does not. | State the limit plainly in the block confirmation copy. | P2 | 7 |
| 11 | Engineering | Content is deleted on accept, so no trail remains. | "It never arrived" becomes undebuggable, and support has no data. | Keep metadata without content for a short fixed period. | P2 | 4, 6 |
| 12 | Product | Tier 2 reports no behaviour data to the sender, so it does not feed the adaptive-reminder differentiator. | The feature competes with the core differentiator for build time. | Confirm the strategic order. Decide whether Tier 2 comes before or after adaptation. | P2 | Scope |
| 13 | Product | Tier 1 already solves the problem for most pairs, at zero cost. | The added value is only that the recipient's phone rings without a sender tap, and it costs 25 USD each month plus permanent operations. | Validate demand with 10 target users before step 1. | P2 | Scope |
| 14 | Cost | The operational commitment (uptime, FCM credential rotation, backups, indefinitely) has no named owner. | This is the item most likely to fail in year two, for a free app with no monetisation. | Name the owner and the minimum service level, or reduce the scope. | P2 | 10 |

## Suggested agent actions

1. Read the source spec.
2. Add a "Known defects" section to the spec with rows 1 to 3.
3. Propose a resolution for each P0 row. Do not write code yet.
4. Update the build order with the new step 0.
5. Report back before you change the schema.
