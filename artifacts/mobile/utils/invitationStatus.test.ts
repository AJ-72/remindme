import { applyEvent } from "@/utils/invitationStatus";

describe("applyEvent", () => {
  it("moves an invitation to accepted when the recipient accepts", () => {
    expect(applyEvent("invited", "accept")).toEqual({
      status: "accepted",
      refused: false,
    });
  });
  it("lets the sender cancel from any state that has not settled", () => {
    // Cancel is the sender's one-way kill switch. A cancelled appointment that
    // rings anyway is the actively harmful outcome this rule exists to prevent.
    expect(applyEvent("invited", "cancel")).toEqual({
      status: "cancelled",
      refused: false,
    });
    expect(applyEvent("accepted", "cancel")).toEqual({
      status: "cancelled",
      refused: false,
    });
    expect(applyEvent("rescheduled", "cancel")).toEqual({
      status: "cancelled",
      refused: false,
    });
  });
  it("refuses an event a settled invitation cannot honour, distinguishably", () => {
    // Amma reschedules in the same minute the sender cancels. Cancel wins - but
    // she must be TOLD her change was discarded, so a refusal must not be
    // indistinguishable from a no-op that quietly succeeded.
    expect(applyEvent("cancelled", "reschedule")).toEqual({
      status: "cancelled",
      refused: true,
    });
  });
  it("expires only an invitation nobody answered", () => {
    // An unanswered 08:00 reminder is meaningless at 08:01, so that is when it
    // dies. An ACCEPTED one does not expire - it fires, from the recipient's
    // own device, which is the whole point of transferring it.
    expect(applyEvent("invited", "expire")).toEqual({
      status: "expired",
      refused: false,
    });
    expect(applyEvent("accepted", "expire")).toEqual({
      status: "accepted",
      refused: true,
    });
  });
  it("keeps decline and block as different answers", () => {
    // Decline is "not this one". Block is "never again". Overloading decline
    // with block would mean one impatient tap silently severs a relationship.
    expect(applyEvent("invited", "decline")).toEqual({
      status: "declined",
      refused: false,
    });
    expect(applyEvent("invited", "block")).toEqual({
      status: "blocked",
      refused: false,
    });
  });
  it("lets the recipient reschedule, more than once", () => {
    // Rescheduling is the recipient exercising her own device. There is no
    // reason a second change should be refused when the first was allowed.
    expect(applyEvent("accepted", "reschedule")).toEqual({
      status: "rescheduled",
      refused: false,
    });
    expect(applyEvent("rescheduled", "reschedule")).toEqual({
      status: "rescheduled",
      refused: false,
    });
  });

  it("refuses to reschedule an invitation that was never accepted", () => {
    // Nothing is armed on her device yet, so there is no time to move.
    expect(applyEvent("invited", "reschedule")).toEqual({
      status: "invited",
      refused: true,
    });
  });
  it("completes from either scheduled state", () => {
    // "Done" flowing back is the acknowledgement that makes this Tier 2 rather
    // than Tier 1, and a rescheduled reminder completes just like an untouched
    // one.
    expect(applyEvent("accepted", "complete")).toEqual({
      status: "done",
      refused: false,
    });
    expect(applyEvent("rescheduled", "complete")).toEqual({
      status: "done",
      refused: false,
    });
  });

  it("lets no event escape a settled invitation", () => {
    // The property that matters more than any single transition: once an
    // invitation has settled, nothing revives it. Especially not a late event
    // arriving out of order from a device that was offline.
    const settled = ["declined", "blocked", "expired", "cancelled", "done"] as const;
    const events = [
      "accept",
      "decline",
      "block",
      "reschedule",
      "expire",
      "complete",
      "cancel",
    ] as const;

    for (const status of settled) {
      for (const event of events) {
        expect(applyEvent(status, event)).toEqual({ status, refused: true });
      }
    }
  });
});
