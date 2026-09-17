import { assertEquals } from "https://deno.land/std@0.208.0/testing/asserts.ts";
import { handleClaimInvitations } from "./index.ts";

Deno.test("returns the claimed rows from claim_invitations()", async () => {
  const client = {
    rpc: async (fn: string) => {
      assertEquals(fn, "claim_invitations");
      return {
        data: [{ id: "inv-1", title: "X", description: "Y", datetime: "2026-09-09T08:00:00Z", sender_id: "sender-1" }],
        error: null,
      };
    },
    // deno-lint-ignore no-explicit-any
  } as any;
  const result = await handleClaimInvitations(client);
  assertEquals(result.claimed.length, 1);
  assertEquals(result.claimed[0].senderId, "sender-1");
});

Deno.test("returns an empty array when nothing is pending", async () => {
  const client = {
    rpc: async () => ({ data: [], error: null }),
    // deno-lint-ignore no-explicit-any
  } as any;
  const result = await handleClaimInvitations(client);
  assertEquals(result.claimed, []);
});
