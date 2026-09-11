import { assertEquals } from "https://deno.land/std@0.208.0/testing/asserts.ts";
import { getAuthedClient } from "./supabaseClient.ts";

Deno.test("getAuthedClient returns 401 when Authorization header is missing", async () => {
  Deno.env.set("SUPABASE_URL", "https://example.supabase.co");
  Deno.env.set("SUPABASE_ANON_KEY", "test-anon-key");
  const req = new Request("https://example.com/fn", { method: "POST" });
  const result = await getAuthedClient(req);
  if (!(result instanceof Response)) {
    throw new Error("expected a Response for missing auth header");
  }
  assertEquals(result.status, 401);
  const body = await result.json();
  assertEquals(body.error.code, "not_authenticated");
});
