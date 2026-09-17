import { assertEquals } from "https://deno.land/std@0.208.0/testing/asserts.ts";
import { handleExpireInvitations, checkCronAuth } from "./index.ts";

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

// Final-review Fix 4: the auth check must fail CLOSED. An unset CRON_SECRET
// previously fell through to "allow the call" - this is the test that would
// have caught that bug.
Deno.test("checkCronAuth refuses when CRON_SECRET is unset in the environment", () => {
  const req = new Request("http://localhost/", {
    headers: { "x-cron-secret": "whatever-the-caller-sends" },
  });
  assertEquals(checkCronAuth(req, undefined), false);
});

Deno.test("checkCronAuth refuses when CRON_SECRET is set but the header doesn't match", () => {
  const req = new Request("http://localhost/", {
    headers: { "x-cron-secret": "wrong-secret" },
  });
  assertEquals(checkCronAuth(req, "correct-secret"), false);
});

Deno.test("checkCronAuth refuses when the header is missing entirely, even with CRON_SECRET set", () => {
  const req = new Request("http://localhost/");
  assertEquals(checkCronAuth(req, "correct-secret"), false);
});

Deno.test("checkCronAuth allows when CRON_SECRET is set and the header matches", () => {
  const req = new Request("http://localhost/", {
    headers: { "x-cron-secret": "correct-secret" },
  });
  assertEquals(checkCronAuth(req, "correct-secret"), true);
});
