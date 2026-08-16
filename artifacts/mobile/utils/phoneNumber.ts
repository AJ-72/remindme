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
