// OTP send/verify wrapper (T0.4). Behind a swappable `OtpProvider` interface
// per the plan — no real SMS provider is chosen yet (see T0.5/ADR TBD): the
// spec wants an Indian domestic provider (e.g. MSG91, ~₹0.15-0.20/OTP) for
// cost, but that is not one of Supabase Auth's natively supported providers
// (Twilio/MessageBird/Vonage/TextLocal only), so binding it would mean either
// eating Twilio's ~3x India price or routing through a custom Edge Function
// via Supabase's Send SMS Hook. Both are real, costed choices for a human to
// make — `unconfiguredOtpProvider` exists so the rest of the client can be
// built and tested against the interface before that choice is made.

export type OtpResult = { ok: true } | { ok: false; error: string };

export interface OtpProvider {
  send(phoneE164: string): Promise<OtpResult>;
  verify(phoneE164: string, code: string): Promise<OtpResult>;
}

export async function sendOtp(provider: OtpProvider, phoneE164: string): Promise<OtpResult> {
  return provider.send(phoneE164);
}

export async function verifyOtp(
  provider: OtpProvider,
  phoneE164: string,
  code: string
): Promise<OtpResult> {
  return provider.verify(phoneE164, code);
}

// Placeholder provider: refuses every call. Wire up a real provider (see
// comment above) and switch callers to it once T0.5's decision is made.
export const unconfiguredOtpProvider: OtpProvider = {
  async send(): Promise<OtpResult> {
    return { ok: false, error: "provider_not_configured" };
  },
  async verify(): Promise<OtpResult> {
    return { ok: false, error: "provider_not_configured" };
  },
};
