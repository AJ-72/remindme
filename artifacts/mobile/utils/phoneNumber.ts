import { getLocales } from "expo-localization";

/**
 * Region -> international calling code.
 *
 * Deliberately NOT hardcoded to India. A Malayalam-supporting app has a
 * meaningful NRI cohort, and baking in 91 would break every one of them.
 * Unlisted regions return null and the caller declines to guess.
 */
const CALLING_CODES: Record<string, string> = {
  IN: "91",
  US: "1",
  CA: "1",
  GB: "44",
  AE: "971",
  SA: "966",
  QA: "974",
  KW: "965",
  OM: "968",
  BH: "973",
  SG: "65",
  MY: "60",
  AU: "61",
  NZ: "64",
  DE: "49",
  FR: "33",
  IT: "39",
  ES: "34",
  NL: "31",
  IE: "353",
  CH: "41",
  SE: "46",
  NO: "47",
  DK: "45",
  ZA: "27",
  NG: "234",
  KE: "254",
  LK: "94",
  NP: "977",
  BD: "880",
  PK: "92",
  JP: "81",
  KR: "82",
  CN: "86",
  HK: "852",
  PH: "63",
  ID: "62",
  TH: "66",
  VN: "84",
  BR: "55",
  MX: "52",
};

export function callingCodeForRegion(region?: string | null): string | null {
  if (!region) return null;
  return CALLING_CODES[region.toUpperCase()] ?? null;
}

function deviceCallingCode(): string | null {
  try {
    return callingCodeForRegion(getLocales()[0]?.regionCode);
  } catch {
    return null;
  }
}

/**
 * Normalize a contact's phone string to E.164-ish (`+<country><national>`).
 *
 * Runs at SEND time, never on save: contact strings vary wildly and baking a
 * heuristic into stored data makes it permanent, whereas fixing this function
 * repairs every existing reminder with no migration.
 *
 * Returns null rather than guessing. A broken wa.me link is worse than an
 * honest fallback to SMS with the raw number.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasPlus = trimmed.startsWith("+") || /^\(\s*\+/.test(trimmed);
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  // Explicit international form wins outright - never second-guess it with the
  // device region, which is wrong for exactly the NRI case above.
  if (hasPlus) {
    return digits.length >= 8 ? `+${digits}` : null;
  }

  // 00 is the other unambiguous international prefix.
  if (digits.startsWith("00")) {
    const rest = digits.slice(2);
    return rest.length >= 8 ? `+${rest}` : null;
  }

  const cc = deviceCallingCode();
  if (!cc) return null;

  // National trunk prefix: 0 followed by exactly 10 digits.
  if (digits.startsWith("0") && digits.length === 11) {
    return `+${cc}${digits.slice(1)}`;
  }

  // Bare national number.
  if (digits.length === 10) {
    return `+${cc}${digits}`;
  }

  return null;
}

/** wa.me takes digits only - no +, no spaces. */
export function toWhatsAppDigits(normalized: string | null): string | null {
  if (!normalized) return null;
  const digits = normalized.replace(/\D/g, "");
  return digits || null;
}

/**
 * A number normalized for IDENTITY - the string that gets hashed to find
 * someone. Distinct from normalizePhone, which exists to build a wa.me link on
 * the sender's own device and may guess freely because a wrong guess just falls
 * back to SMS.
 *
 * Identity cannot guess freely. Both devices must derive the SAME string or the
 * hashes never match, and the failure is silent and permanent: the recipient
 * simply appears never to have installed the app.
 */
export interface PhoneIdentity {
  /** E.164, or null when the input could not be resolved at all. */
  e164: string | null;
  /**
   * True when a region had to be applied to resolve the number, meaning a
   * device in a different region would have produced something else. The
   * lookup is best-effort and a miss must not be cached as durable.
   */
  ambiguous: boolean;
}

/**
 * Region is an EXPLICIT parameter, never read from the device. That is the
 * whole point: normalizePhone reads getLocales() ambiently, which is correct
 * for a wa.me link and wrong for identity.
 */
export function normalizeForIdentity(
  raw: string | null | undefined,
  region: string | null | undefined
): PhoneIdentity {
  const trimmed = (raw ?? "").trim();
  const hasPlus = trimmed.startsWith("+") || /^\(\s*\+/.test(trimmed);
  const digits = trimmed.replace(/\D/g, "");

  // Explicit international form: region is irrelevant, so both devices agree.
  if (hasPlus && digits.length >= 8) {
    return { e164: `+${digits}`, ambiguous: false };
  }

  // 00 is the other unambiguous international prefix.
  if (digits.startsWith("00") && digits.slice(2).length >= 8) {
    return { e164: `+${digits.slice(2)}`, ambiguous: false };
  }

  // Everything below needs a region to resolve, which is precisely what makes
  // it ambiguous - a device in another region would answer differently.
  const cc = callingCodeForRegion(region);
  if (cc) {
    // National trunk prefix: 0 followed by exactly 10 digits.
    if (digits.startsWith("0") && digits.length === 11) {
      return { e164: `+${cc}${digits.slice(1)}`, ambiguous: true };
    }
    if (digits.length === 10) {
      return { e164: `+${cc}${digits}`, ambiguous: true };
    }
  }

  return { e164: null, ambiguous: false };
}
