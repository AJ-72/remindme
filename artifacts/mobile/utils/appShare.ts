/**
 * The blurb and store link used by "Share this app" in Settings.
 *
 * Kept out of the invite nudges in utils/inviteNudges.ts on purpose. Those
 * lines are appended to a message the recipient did not ask for, so they stay
 * short and URL-free - a bare store link there reads as spam and trips
 * WhatsApp's link heuristics. This blurb is different: the user chooses to
 * send it, so a link is exactly what they want.
 */

/**
 * PLACEHOLDER. Replace with the real listing URL at first store publish - the
 * app is not on Play yet, and shipping a dead link is worse than shipping a
 * plainly-marked stand-in. `buildAppShareMessage` omits the link entirely
 * while this is unset, so the share still produces a sensible message.
 */
export const APP_STORE_URL = "";

export const APP_SHARE_BLURB =
  "Reminders — a small app for reminders that actually go off, and for nudging " +
  "someone else about theirs. Works in English and Malayalam, by voice or typing. " +
  "Everything stays on your phone.";

/**
 * The message body for a share. Drops the link line rather than emitting an
 * empty or placeholder URL, so an unreleased build shares clean text.
 */
export function buildAppShareMessage(storeUrl: string = APP_STORE_URL): string {
  const link = storeUrl.trim();
  return link ? `${APP_SHARE_BLURB}\n\n${link}` : APP_SHARE_BLURB;
}
