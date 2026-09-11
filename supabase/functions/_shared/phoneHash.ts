// Server-side HMAC phone hashing (T2.1), shared by any function that needs
// to turn a raw E.164 number into the same hash `hash_lookup()` compares
// against. Extracted from lookup/index.ts so self-register can reuse it
// without drifting from lookup's normalization.
export async function hmacPhoneHash(phoneE164: string): Promise<string> {
  const pepper = Deno.env.get("PHONE_HASH_PEPPER")!;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(phoneE164));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
