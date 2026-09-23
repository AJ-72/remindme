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

/**
 * National significant number length, min/max digits, per region.
 *
 * A bare national number (no +, no leading 00) is only resolvable by
 * checking it against ITS OWN region's plausible length - a single hardcoded
 * "10 digits" (India's and the US's length, coincidentally) silently
 * rejected every valid number outside that shape, e.g. a German mobile
 * number (10-11 digits with area code) or a Emirati one (8-9). Unlisted
 * regions fall back to {10, 10}, matching this file's behavior before this
 * table existed.
 */
const NATIONAL_LENGTH_RANGE: Record<string, { min: number; max: number }> = {
  IN: { min: 10, max: 10 },
  US: { min: 10, max: 10 },
  CA: { min: 10, max: 10 },
  GB: { min: 10, max: 10 },
  AE: { min: 8, max: 9 },
  SA: { min: 8, max: 9 },
  QA: { min: 7, max: 8 },
  KW: { min: 7, max: 8 },
  OM: { min: 7, max: 8 },
  BH: { min: 7, max: 8 },
  SG: { min: 8, max: 8 },
  MY: { min: 8, max: 9 },
  AU: { min: 9, max: 9 },
  NZ: { min: 8, max: 9 },
  DE: { min: 7, max: 11 },
  FR: { min: 9, max: 9 },
  IT: { min: 9, max: 10 },
  ES: { min: 9, max: 9 },
  NL: { min: 9, max: 9 },
  IE: { min: 7, max: 9 },
  CH: { min: 9, max: 9 },
  SE: { min: 7, max: 9 },
  NO: { min: 8, max: 8 },
  DK: { min: 8, max: 8 },
  ZA: { min: 9, max: 9 },
  NG: { min: 7, max: 10 },
  KE: { min: 9, max: 9 },
  LK: { min: 9, max: 9 },
  NP: { min: 8, max: 10 },
  BD: { min: 8, max: 10 },
  PK: { min: 9, max: 10 },
  JP: { min: 9, max: 10 },
  KR: { min: 8, max: 10 },
  CN: { min: 11, max: 11 },
  HK: { min: 8, max: 8 },
  PH: { min: 9, max: 10 },
  ID: { min: 8, max: 11 },
  TH: { min: 8, max: 9 },
  VN: { min: 9, max: 10 },
  BR: { min: 10, max: 11 },
  MX: { min: 10, max: 10 },
};

function nationalLengthRange(region: string | null | undefined): { min: number; max: number } {
  const key = region?.toUpperCase();
  return (key && NATIONAL_LENGTH_RANGE[key]) || { min: 10, max: 10 };
}

const REGION_NAMES: Record<string, string> = {
  IN: "India",
  US: "United States",
  CA: "Canada",
  GB: "United Kingdom",
  AE: "United Arab Emirates",
  SA: "Saudi Arabia",
  QA: "Qatar",
  KW: "Kuwait",
  OM: "Oman",
  BH: "Bahrain",
  SG: "Singapore",
  MY: "Malaysia",
  AU: "Australia",
  NZ: "New Zealand",
  DE: "Germany",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  NL: "Netherlands",
  IE: "Ireland",
  CH: "Switzerland",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  ZA: "South Africa",
  NG: "Nigeria",
  KE: "Kenya",
  LK: "Sri Lanka",
  NP: "Nepal",
  BD: "Bangladesh",
  PK: "Pakistan",
  JP: "Japan",
  KR: "South Korea",
  CN: "China",
  HK: "Hong Kong",
  PH: "Philippines",
  ID: "Indonesia",
  TH: "Thailand",
  VN: "Vietnam",
  BR: "Brazil",
  MX: "Mexico",
};

export function callingCodeForRegion(region?: string | null): string | null {
  if (!region) return null;
  return CALLING_CODES[region.toUpperCase()] ?? null;
}

export interface CountryOption {
  region: string;
  name: string;
  callingCode: string;
}

/**
 * Every region with a known calling code, for a country-code picker UI.
 * Sorted by name so the list reads naturally regardless of insertion order.
 */
export function listCountries(): CountryOption[] {
  return Object.keys(CALLING_CODES)
    .map((region) => ({
      region,
      name: REGION_NAMES[region] ?? region,
      callingCode: CALLING_CODES[region],
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
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

  const region = getLocales()[0]?.regionCode;
  const cc = deviceCallingCode();
  if (!cc) return null;
  const { min, max } = nationalLengthRange(region);

  // National trunk prefix: 0 followed by a plausible national length for
  // this region.
  if (digits.startsWith("0") && digits.length - 1 >= min && digits.length - 1 <= max) {
    return `+${cc}${digits.slice(1)}`;
  }

  // Bare national number.
  if (digits.length >= min && digits.length <= max) {
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
  region: string | null | undefined,
  // True when `region` came from the user explicitly picking a country code
  // (e.g. a registration-screen picker), not from guessing the device
  // locale. An explicit pick removes the ambiguity entirely - a device in a
  // different region would still resolve the same way, since the region
  // isn't being guessed - so the result is safe to cache as durable.
  regionExplicit = false
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

  // Everything below needs a region to resolve. Unless that region was
  // explicitly chosen, this is precisely what makes it ambiguous - a device
  // in another region would answer differently.
  const cc = callingCodeForRegion(region);
  if (cc) {
    const { min, max } = nationalLengthRange(region);
    // National trunk prefix: 0 followed by a plausible national length for
    // this region.
    if (digits.startsWith("0") && digits.length - 1 >= min && digits.length - 1 <= max) {
      return { e164: `+${cc}${digits.slice(1)}`, ambiguous: !regionExplicit };
    }
    if (digits.length >= min && digits.length <= max) {
      return { e164: `+${cc}${digits}`, ambiguous: !regionExplicit };
    }
  }

  return { e164: null, ambiguous: false };
}

/**
 * Regions to retry an ambiguous identity lookup against, beyond the device
 * region already tried. Short and fixed rather than exhaustive - this app's
 * actual cohort (per the CALLING_CODES comment) is Malayalam speakers plus
 * their NRI/Gulf diaspora, not every region in CALLING_CODES.
 */
const FALLBACK_IDENTITY_REGIONS = ["IN", "US", "GB", "AE", "SA"];

/**
 * When normalizeForIdentity's first guess misses, the number may still be
 * resolvable under a different region - a contact saved as bare digits on a
 * device whose region doesn't match the number's real country. Returns
 * additional E.164 candidates worth trying, most-plausible first, excluding
 * whatever normalizeForIdentity already tried.
 *
 * Only meaningful when the original result was ambiguous (unambiguous means
 * there is nothing to retry - a +prefixed number is already definitive).
 */
export function alternateIdentityCandidates(
  raw: string | null | undefined,
  triedRegion: string | null | undefined
): string[] {
  const trimmed = (raw ?? "").trim();
  const hasPlus = trimmed.startsWith("+") || /^\(\s*\+/.test(trimmed);
  const digits = trimmed.replace(/\D/g, "");
  if (hasPlus || digits.startsWith("00") || !digits) return [];

  const triedUpper = triedRegion?.toUpperCase() ?? null;
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const region of FALLBACK_IDENTITY_REGIONS) {
    if (region === triedUpper) continue;
    const cc = callingCodeForRegion(region);
    if (!cc) continue;

    let national: string | null = null;
    if (digits.startsWith("0") && digits.length === 11) {
      national = digits.slice(1);
    } else if (digits.length === 10) {
      national = digits;
    }
    if (!national) continue;

    const e164 = `+${cc}${national}`;
    if (seen.has(e164)) continue;
    seen.add(e164);
    candidates.push(e164);
  }

  return candidates;
}
