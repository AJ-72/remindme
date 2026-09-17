// Deno test for the lookup Edge Function's request/response shape. The
// SECURITY DEFINER functions it calls (hash_lookup, check_lookup_rate_limit)
// are exercised for real against PGlite in lib/db - this test only proves
// the HTTP layer parses input and shapes output correctly, using a fake
// Supabase client.
import { assertEquals } from "https://deno.land/std@0.208.0/testing/asserts.ts";
import { handleLookup } from "./index.ts";

function fakeClient(rpcResults: Record<string, unknown>) {
  return {
    rpc: async (fn: string, _args: unknown) => ({ data: rpcResults[fn], error: null }),
  };
}

Deno.test("returns exists:true with appUserId when hash_lookup finds a match", async () => {
  const client = fakeClient({
    check_lookup_rate_limit: true,
    hash_lookup: [{ app_user_id: "abc-123", exists: true }],
  });
  const result = await handleLookup(
    // deno-lint-ignore no-explicit-any
    client as any,
    { phoneE164: "+919876543210", deviceKey: "device-1" },
    "1.2.3.4"
  );
  assertEquals(result, { exists: true, appUserId: "abc-123" });
});

Deno.test("returns exists:false with null appUserId when no match", async () => {
  const client = fakeClient({
    check_lookup_rate_limit: true,
    hash_lookup: [{ app_user_id: null, exists: false }],
  });
  const result = await handleLookup(
    // deno-lint-ignore no-explicit-any
    client as any,
    { phoneE164: "+919876543210", deviceKey: "device-1" },
    "1.2.3.4"
  );
  assertEquals(result, { exists: false, appUserId: null });
});

Deno.test("throws a rate_limited error when check_lookup_rate_limit returns false", async () => {
  const client = fakeClient({ check_lookup_rate_limit: false });
  let threw = false;
  try {
    await handleLookup(
      // deno-lint-ignore no-explicit-any
      client as any,
      { phoneE164: "+919876543210", deviceKey: "device-1" },
      "1.2.3.4"
    );
  } catch (e) {
    threw = true;
    assertEquals((e as Error).message, "rate_limited");
  }
  assertEquals(threw, true);
});
