/**
 * Invite nudges appended to outgoing send-reminder messages.
 *
 * Pure module: no React, no storage, no I/O. The per-contact send count is
 * persisted elsewhere (ReminderService) and passed in.
 *
 * Every line frames the SENDER as forgetful, never the recipient - mocking the
 * recipient is the cringe failure mode this whole design exists to avoid.
 * All lines are parenthesised so they read as a footnote, carry no emoji, and
 * contain no URL (a bare store link looks like spam, trips WhatsApp's link
 * heuristics, and with no backend there is no attribution to gain - revisit in
 * Tier 2 with a real link).
 *
 * Malayalam nudges are deliberately deferred: these lines are idiom-heavy and
 * machine translation produces exactly the cringe the requirement exists to
 * avoid. They need a native speaker to write, not translate. Add
 * INVITE_NUDGES_ML keyed off dictationLanguage when that happens.
 */
export const INVITE_NUDGES = {
  first: [
    "(Sent via Reminders — because my memory has a free trial that expired.)",
    "(Reminders app: for people who mean well and forget anyway. Guilty.)",
    "(Yes, an app told me to send this. No, I'm not proud.)",
  ],
  second: [
    "(Still the Reminders app doing the remembering. Still not me.)",
    "(Me again. Well — the app again, technically.)",
  ],
  third: [
    "(Last plug, promise. Reminders app. Then I'll stop.)",
    "(Third and final mention of the app that runs my life. Carry on.)",
  ],
} as const;

/** After this many sends to one person, nothing is ever appended again. */
export const MAX_NUDGE_SENDS = 3;

/**
 * Practical ceiling for the composed message. Title (300) + description (1000)
 * + nudge comfortably exceeds intent-URI limits on Android.
 */
export const MAX_MESSAGE_CHARS = 900;

/** Stable string hash - deterministic across runs, unlike Math.random. */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/**
 * The nudge line for the Nth send to one recipient, or null once the cap is hit.
 *
 * `sendCount` is how many sends have ALREADY happened to this person, so the
 * first send passes 0. The counter must advance only on an actual send, never
 * on screen render, or opening the screen twice burns a stage.
 *
 * Variety comes from hashing the phone digits, so different recipients get
 * different lines and one recipient never sees the same line twice.
 */
export function nudgeForSendCount(
  sendCount: number,
  phoneDigits: string
): string | null {
  const stageIndex = Math.max(0, sendCount);
  if (stageIndex >= MAX_NUDGE_SENDS) return null;

  const pool =
    stageIndex === 0
      ? INVITE_NUDGES.first
      : stageIndex === 1
        ? INVITE_NUDGES.second
        : INVITE_NUDGES.third;

  // Offset by stage so consecutive stages cannot land on the same text.
  const h = hashString(phoneDigits) + stageIndex * 7;
  return pool[h % pool.length];
}

export interface ComposeInput {
  title: string;
  description: string;
  nudge?: string | null;
}

/**
 * Build the outgoing message body. Truncates the BODY, never the nudge - the
 * nudge is the shortest part and dropping it silently would defeat the cap's
 * purpose while looking fine.
 */
export function composeMessage({
  title,
  description,
  nudge,
}: ComposeInput): string {
  const parts: string[] = [title.trim()];
  if (description.trim()) parts.push(description.trim());

  let body = parts.filter(Boolean).join("\n\n");

  if (nudge) {
    const room = MAX_MESSAGE_CHARS - nudge.length - 2; // 2 for the blank line
    if (body.length > room) body = body.slice(0, Math.max(0, room)).trimEnd();
    return body ? `${body}\n\n${nudge}` : nudge;
  }

  return body.length > MAX_MESSAGE_CHARS
    ? body.slice(0, MAX_MESSAGE_CHARS).trimEnd()
    : body;
}

/**
 * Remove an exact nudge line from (possibly user-edited) text.
 *
 * Returns null when the line is not present verbatim. The caller must then
 * DISABLE the toggle rather than attempt a fuzzy removal - mangling text the
 * user typed themselves is worse than a disabled control.
 */
export function stripNudge(text: string, nudge: string): string | null {
  if (!nudge) return null;
  if (!text.includes(nudge)) return null;
  return text.replace(nudge, "").trimEnd();
}
