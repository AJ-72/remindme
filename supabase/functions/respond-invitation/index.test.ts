import { assertEquals } from "https://deno.land/std@0.208.0/testing/asserts.ts";
import { handleRespondInvitation } from "./index.ts";

function fakeClient(opts: {
  invitation: Record<string, unknown>;
  senderTokens?: string[];
  recipientDisplayName?: string | null;
}) {
  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "respond_to_invitation") {
        assertEquals(args.p_invitation_id, "inv-1");
        return { data: [opts.invitation], error: null };
      }
      if (fn === "get_sender_push_tokens") {
        return {
          data: (opts.senderTokens ?? []).map((t) => ({ expo_push_token: t })),
          error: null,
        };
      }
      throw new Error(`unexpected rpc ${fn}`);
    },
    from: (table: string) => {
      if (table !== "users") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data:
                opts.recipientDisplayName === undefined
                  ? null
                  : { display_name: opts.recipientDisplayName },
              error: null,
            }),
          }),
        }),
      };
    },
    // deno-lint-ignore no-explicit-any
  } as any;
}

Deno.test("calls respond_to_invitation with the given id and response, returns the row", async () => {
  const client = fakeClient({ invitation: { id: "inv-1", status: "accepted" } });
  const result = await handleRespondInvitation(client, "recipient-1", {
    invitationId: "inv-1",
    response: "accepted",
  });
  assertEquals(result.invitation, { id: "inv-1", status: "accepted" });
});

Deno.test("throws when the RPC errors", async () => {
  const client = {
    rpc: async () => ({ data: null, error: { message: "invitation not found" } }),
    // deno-lint-ignore no-explicit-any
  } as any;
  let threw = false;
  try {
    await handleRespondInvitation(client, "recipient-1", { invitationId: "bad", response: "declined" });
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("passes acceptedDatetime through as p_accepted_datetime on accept", async () => {
  let capturedArgs: Record<string, unknown> = {};
  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === "respond_to_invitation") {
        capturedArgs = args;
        return {
          data: [{ id: "inv-1", datetime: "2026-09-10T08:00:00Z", original_datetime: "2026-09-10T08:00:00Z" }],
          error: null,
        };
      }
      return { data: [], error: null };
    },
    // deno-lint-ignore no-explicit-any
  } as any;
  await handleRespondInvitation(client, "recipient-1", {
    invitationId: "inv-1",
    response: "accepted",
    acceptedDatetime: "2026-09-10T09:00:00Z",
  });
  assertEquals(capturedArgs.p_accepted_datetime, "2026-09-10T09:00:00Z");
});

Deno.test("never sends p_accepted_datetime on a decline, even if the client passed one", async () => {
  let capturedArgs: Record<string, unknown> = {};
  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      capturedArgs = args;
      return { data: [{ id: "inv-1", status: "declined" }], error: null };
    },
    // deno-lint-ignore no-explicit-any
  } as any;
  await handleRespondInvitation(client, "recipient-1", {
    invitationId: "inv-1",
    response: "declined",
    acceptedDatetime: "2026-09-10T09:00:00Z",
  });
  assertEquals(capturedArgs.p_accepted_datetime, null);
});

Deno.test("pushes the sender when accept moved the time", async () => {
  const client = fakeClient({
    invitation: {
      id: "inv-1",
      datetime: "2026-09-10T09:00:00Z",
      original_datetime: "2026-09-10T08:00:00Z",
    },
    senderTokens: ["ExponentPushToken[sender-1]"],
    recipientDisplayName: "Amma",
  });
  let pushedTo: string[] = [];
  let pushedMessage: { title: string; body: string; data?: Record<string, unknown> } | undefined;
  await handleRespondInvitation(
    client,
    "recipient-1",
    { invitationId: "inv-1", response: "accepted", acceptedDatetime: "2026-09-10T09:00:00Z" },
    async (tokens, message) => {
      pushedTo = tokens;
      pushedMessage = message;
      return { sent: tokens, failed: [] };
    }
  );
  assertEquals(pushedTo, ["ExponentPushToken[sender-1]"]);
  assertEquals(pushedMessage?.title, "Amma moved a reminder");
  assertEquals(pushedMessage?.data, {
    type: "invitation_time_changed",
    invitationId: "inv-1",
    fromDatetime: "2026-09-10T08:00:00Z",
    toDatetime: "2026-09-10T09:00:00Z",
    recipientName: "Amma",
  });
});

Deno.test("does not push when accept kept the original time", async () => {
  const client = fakeClient({
    invitation: {
      id: "inv-1",
      datetime: "2026-09-10T08:00:00Z",
      original_datetime: "2026-09-10T08:00:00Z",
    },
    senderTokens: ["ExponentPushToken[sender-1]"],
    recipientDisplayName: "Amma",
  });
  let pushCalled = false;
  await handleRespondInvitation(
    client,
    "recipient-1",
    { invitationId: "inv-1", response: "accepted" },
    async (tokens) => {
      pushCalled = tokens.length > 0;
      return { sent: [], failed: [] };
    }
  );
  assertEquals(pushCalled, false);
});

Deno.test("does not push on a decline even if datetime somehow differs", async () => {
  const client = fakeClient({
    invitation: {
      id: "inv-1",
      datetime: "2026-09-10T09:00:00Z",
      original_datetime: "2026-09-10T08:00:00Z",
    },
    senderTokens: ["ExponentPushToken[sender-1]"],
    recipientDisplayName: "Amma",
  });
  let pushCalled = false;
  await handleRespondInvitation(
    client,
    "recipient-1",
    { invitationId: "inv-1", response: "declined" },
    async (tokens) => {
      pushCalled = tokens.length > 0;
      return { sent: [], failed: [] };
    }
  );
  assertEquals(pushCalled, false);
});

Deno.test("falls back to 'Someone' when the recipient has no display_name", async () => {
  const client = fakeClient({
    invitation: {
      id: "inv-1",
      datetime: "2026-09-10T09:00:00Z",
      original_datetime: "2026-09-10T08:00:00Z",
    },
    senderTokens: ["ExponentPushToken[sender-1]"],
    recipientDisplayName: null,
  });
  let pushedTitle = "";
  await handleRespondInvitation(
    client,
    "recipient-1",
    { invitationId: "inv-1", response: "accepted", acceptedDatetime: "2026-09-10T09:00:00Z" },
    async (tokens, message) => {
      pushedTitle = message.title;
      return { sent: tokens, failed: [] };
    }
  );
  assertEquals(pushedTitle, "Someone moved a reminder");
});

Deno.test("still returns the invitation when the sender has no registered device", async () => {
  const client = fakeClient({
    invitation: {
      id: "inv-1",
      datetime: "2026-09-10T09:00:00Z",
      original_datetime: "2026-09-10T08:00:00Z",
    },
    senderTokens: [],
    recipientDisplayName: "Amma",
  });
  let pushCalled = false;
  const result = await handleRespondInvitation(
    client,
    "recipient-1",
    { invitationId: "inv-1", response: "accepted", acceptedDatetime: "2026-09-10T09:00:00Z" },
    async (tokens) => {
      pushCalled = tokens.length > 0;
      return { sent: [], failed: [] };
    }
  );
  assertEquals(pushCalled, false);
  assertEquals(result.invitation.id, "inv-1");
});

Deno.test("still returns the invitation when pushSender throws", async () => {
  const client = fakeClient({
    invitation: {
      id: "inv-1",
      datetime: "2026-09-10T09:00:00Z",
      original_datetime: "2026-09-10T08:00:00Z",
    },
    senderTokens: ["ExponentPushToken[sender-1]"],
    recipientDisplayName: "Amma",
  });
  const result = await handleRespondInvitation(
    client,
    "recipient-1",
    { invitationId: "inv-1", response: "accepted", acceptedDatetime: "2026-09-10T09:00:00Z" },
    async () => {
      throw new Error("network error");
    }
  );
  assertEquals(result.invitation.id, "inv-1");
});
