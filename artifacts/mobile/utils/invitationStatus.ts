/**
 * The lifecycle of a Tier 2 invitation, as a pure function.
 *
 * Pure and total on purpose: this is the rule set deciding whether a cancelled
 * reminder can be resurrected, and it must be readable and testable without a
 * server, a device, or a clock.
 */

export type InvitationStatus =
  | "invited"
  | "accepted"
  | "rescheduled"
  | "done"
  | "declined"
  | "blocked"
  | "expired"
  | "cancelled";

export type InvitationEvent =
  | "accept"
  | "decline"
  | "block"
  | "reschedule"
  | "complete"
  | "expire"
  | "cancel";

/** States from which no further transition is possible. */
const TERMINAL: ReadonlySet<InvitationStatus> = new Set([
  "done",
  "declined",
  "blocked",
  "expired",
  "cancelled",
]);

export interface TransitionResult {
  status: InvitationStatus;
  /**
   * True when the event could not be honoured. Deliberately distinct from "the
   * status happened not to change": the concurrent-edit rule requires the
   * recipient be TOLD her reschedule lost to the sender's cancel, so a refusal
   * that looks like a quiet success would silently swallow that.
   */
  refused: boolean;
}

export function applyEvent(
  status: InvitationStatus,
  event: InvitationEvent
): TransitionResult {
  if (TERMINAL.has(status)) return { status, refused: true };

  // Cancel is the sender's kill switch and wins from anywhere still in flight.
  if (event === "cancel") return { status: "cancelled", refused: false };

  if (status === "invited" && event === "accept") {
    return { status: "accepted", refused: false };
  }

  // Decline is "not this one"; block is "never again". Kept separate so one
  // impatient tap cannot silently sever a relationship.
  if (status === "invited" && event === "decline") {
    return { status: "declined", refused: false };
  }
  if (status === "invited" && event === "block") {
    return { status: "blocked", refused: false };
  }

  // The recipient may move an accepted reminder as often as she likes - it is
  // her device. Rescheduling something never accepted is refused: nothing is
  // armed yet, so there is no time to move.
  if (
    (status === "accepted" || status === "rescheduled") &&
    event === "reschedule"
  ) {
    return { status: "rescheduled", refused: false };
  }

  // "Done" flowing back is the acknowledgement that makes this Tier 2.
  if (
    (status === "accepted" || status === "rescheduled") &&
    event === "complete"
  ) {
    return { status: "done", refused: false };
  }

  // Expiry belongs to an unanswered invitation only. An accepted reminder does
  // not expire - it fires from the recipient's own device.
  if (status === "invited" && event === "expire") {
    return { status: "expired", refused: false };
  }

  return { status, refused: true };
}
