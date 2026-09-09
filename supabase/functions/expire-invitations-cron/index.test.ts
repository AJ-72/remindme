import { assertEquals } from "https://deno.land/std@0.208.0/testing/asserts.ts";
import { handleExpireInvitations } from "./index.ts";

Deno.test("calls expire_invitations and returns the count expired", async () => {
  const client = {
    rpc: async (fn: string) => {
      assertEquals(fn, "expire_invitations");
      return { data: [{ id: "inv-1" }, { id: "inv-2" }], error: null };
    },
    // deno-lint-ignore no-explicit-any
  } as any;
  const result = await handleExpireInvitations(client);
  assertEquals(result.expiredCount, 2);
});
