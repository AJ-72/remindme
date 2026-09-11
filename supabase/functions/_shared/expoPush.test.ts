import { assertEquals } from "https://deno.land/std@0.208.0/testing/asserts.ts";
import { sendExpoPush } from "./expoPush.ts";

Deno.test("posts to Expo's push API and returns sent tokens on success", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ data: [{ status: "ok" }] }),
      { status: 200 }
    )) as typeof fetch;

  const result = await sendExpoPush(["ExponentPushToken[abc]"], {
    title: "Reminder from Anand",
    body: "Take BP tablets",
  });

  globalThis.fetch = originalFetch;
  assertEquals(result, { sent: ["ExponentPushToken[abc]"], failed: [] });
});

Deno.test("reports a failed token without throwing, when Expo returns an error status per-token", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ data: [{ status: "error", details: { error: "DeviceNotRegistered" } }] }),
      { status: 200 }
    )) as typeof fetch;

  const result = await sendExpoPush(["ExponentPushToken[dead]"], {
    title: "X",
    body: "Y",
  });

  globalThis.fetch = originalFetch;
  assertEquals(result, { sent: [], failed: ["ExponentPushToken[dead]"] });
});

Deno.test("returns an empty result for an empty token list without calling fetch", async () => {
  let called = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    called = true;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  const result = await sendExpoPush([], { title: "X", body: "Y" });

  globalThis.fetch = originalFetch;
  assertEquals(called, false);
  assertEquals(result, { sent: [], failed: [] });
});
