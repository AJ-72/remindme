import { assertEquals } from "https://deno.land/std@0.208.0/testing/asserts.ts";
import { handleSendInvitation } from "./index.ts";

function fakeClient(opts: {
  invitation: Record<string, unknown>;
  deviceTokens: string[];
}) {
  return {
    rpc: async (fn: string) => {
      if (fn === "send_invitation") return { data: [opts.invitation], error: null };
      throw new Error(`unexpected rpc ${fn}`);
    },
    from: (table: string) => ({
      select: () => ({
        eq: async () => ({
          data: opts.deviceTokens.map((t) => ({ expo_push_token: t })),
          error: null,
        }),
      }),
    }),
    // deno-lint-ignore no-explicit-any
  } as any;
}

Deno.test("creates the invitation and returns it", async () => {
  const client = fakeClient({
    invitation: { id: "inv-1", title: "Take BP tablets" },
    deviceTokens: ["ExponentPushToken[abc]"],
  });
  let pushedTo: string[] = [];
  const result = await handleSendInvitation(
    client,
    {
      recipientAppUserId: "user-1",
      title: "Take BP tablets",
      description: "After breakfast",
      datetime: new Date().toISOString(),
    },
    async (tokens) => {
      pushedTo = tokens;
      return { sent: tokens, failed: [] };
    }
  );
  assertEquals(result.invitation, { id: "inv-1", title: "Take BP tablets" });
  assertEquals(pushedTo, ["ExponentPushToken[abc]"]);
});

Deno.test("still returns the invitation when the recipient has no registered device", async () => {
  const client = fakeClient({ invitation: { id: "inv-2" }, deviceTokens: [] });
  let pushCalled = false;
  const result = await handleSendInvitation(
    client,
    {
      recipientAppUserId: "user-2",
      title: "X",
      description: "Y",
      datetime: new Date().toISOString(),
    },
    async (tokens) => {
      pushCalled = tokens.length > 0;
      return { sent: [], failed: [] };
    }
  );
  assertEquals(result.invitation, { id: "inv-2" });
  assertEquals(pushCalled, false);
});
