import { assertEquals, assertRejects } from "https://deno.land/std@0.208.0/testing/asserts.ts";
import { handleJoinWaitlist } from "./index.ts";

function fakeClient(onUpsert?: (row: Record<string, unknown>) => void) {
  return {
    from: (table: string) => {
      if (table !== "waitlist_signups") throw new Error(`unexpected table ${table}`);
      return {
        upsert: async (row: Record<string, unknown>) => {
          onUpsert?.(row);
          return { error: null };
        },
      };
    },
    // deno-lint-ignore no-explicit-any
  } as any;
}

Deno.test("normalizes an email before writing the Android landing-page signup", async () => {
  let written: Record<string, unknown> | undefined;
  const result = await handleJoinWaitlist(fakeClient((row) => { written = row; }), {
    email: "  ANAND@Example.COM ",
  });

  assertEquals(result, { ok: true });
  assertEquals(written, {
    email: "anand@example.com",
    source: "landing-page",
    platform: "android",
    status: "pending",
  });
});

Deno.test("rejects malformed emails without writing a row", async () => {
  await assertRejects(
    () => handleJoinWaitlist(fakeClient(), { email: "not-an-email" }),
    Error,
    "invalid_email"
  );
});

Deno.test("accepts honeypot submissions without persisting them", async () => {
  let wrote = false;
  const result = await handleJoinWaitlist(fakeClient(() => { wrote = true; }), {
    email: "bot@example.com",
    website: "https://spam.example",
  });

  assertEquals(result, { ok: true });
  assertEquals(wrote, false);
});
