import { assertEquals } from "https://deno.land/std@0.208.0/testing/asserts.ts";
import { handleRespondInvitation } from "./index.ts";

Deno.test("calls respond_to_invitation with the given id and response, returns the row", async () => {
  const client = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      assertEquals(fn, "respond_to_invitation");
      assertEquals(args, { p_invitation_id: "inv-1", p_response: "accepted" });
      return { data: [{ id: "inv-1", status: "accepted" }], error: null };
    },
    // deno-lint-ignore no-explicit-any
  } as any;
  const result = await handleRespondInvitation(client, { invitationId: "inv-1", response: "accepted" });
  assertEquals(result.invitation, { id: "inv-1", status: "accepted" });
});

Deno.test("throws when the RPC errors", async () => {
  const client = {
    rpc: async () => ({ data: null, error: { message: "invitation not found" } }),
    // deno-lint-ignore no-explicit-any
  } as any;
  let threw = false;
  try {
    await handleRespondInvitation(client, { invitationId: "bad", response: "declined" });
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});
