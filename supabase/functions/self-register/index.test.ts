import { assertEquals, assertRejects } from "https://deno.land/std@0.208.0/testing/asserts.ts";
import { handleSelfRegister } from "./index.ts";

Deno.env.set("PHONE_HASH_PEPPER", "test-pepper");

function fakeClient(opts: { expectedRpc: string; row?: { id: string } | null; error?: unknown }) {
  return {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      assertEquals(fn, opts.expectedRpc);
      assertEquals(typeof args.p_phone_hash, "string");
      if (opts.error) return { data: null, error: opts.error };
      return { data: opts.row ? [opts.row] : [], error: null };
    },
    // deno-lint-ignore no-explicit-any
  } as any;
}

Deno.test("defaults to self_register when no action is given", async () => {
  const client = fakeClient({ expectedRpc: "self_register", row: { id: "user-1" } });
  const result = await handleSelfRegister(client, { phoneE164: "+919876543210" });
  assertEquals(result, { ok: true, appUserId: "user-1" });
});

Deno.test("routes action:register to self_register explicitly", async () => {
  const client = fakeClient({ expectedRpc: "self_register", row: { id: "user-1" } });
  const result = await handleSelfRegister(client, { phoneE164: "+919876543210", action: "register" });
  assertEquals(result, { ok: true, appUserId: "user-1" });
});

Deno.test("routes action:reset to reset_phone_number", async () => {
  const client = fakeClient({ expectedRpc: "reset_phone_number", row: { id: "user-2" } });
  const result = await handleSelfRegister(client, { phoneE164: "+919876543210", action: "reset" });
  assertEquals(result, { ok: true, appUserId: "user-2" });
});

Deno.test("routes action:migrate to migrate_phone_number", async () => {
  const client = fakeClient({ expectedRpc: "migrate_phone_number", row: { id: "user-3" } });
  const result = await handleSelfRegister(client, { phoneE164: "+919876543210", action: "migrate" });
  assertEquals(result, { ok: true, appUserId: "user-3" });
});

Deno.test("throws when the RPC errors", async () => {
  const client = fakeClient({ expectedRpc: "self_register", error: { message: "already registered" } });
  await assertRejects(() => handleSelfRegister(client, { phoneE164: "+919876543210" }));
});

Deno.test("throws self_register_failed when the RPC returns no row", async () => {
  const client = fakeClient({ expectedRpc: "self_register", row: null });
  await assertRejects(
    () => handleSelfRegister(client, { phoneE164: "+919876543210" }),
    Error,
    "self_register_failed"
  );
});
