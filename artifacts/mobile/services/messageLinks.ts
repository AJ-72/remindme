import { Platform } from "react-native";
import { normalizePhone, toWhatsAppDigits } from "@/utils/phoneNumber";

/**
 * WhatsApp deep link.
 *
 * Uses the wa.me UNIVERSAL link rather than the whatsapp:// scheme: wa.me
 * resolves to the installed app via App/Universal Links and degrades to a
 * browser install page when WhatsApp is absent, whereas whatsapp:// requires an
 * iOS LSApplicationQueriesSchemes entry and hard-fails without one.
 *
 * Returns null when the number could not be normalized - callers must then
 * offer SMS instead rather than emitting a broken link.
 */
export function whatsAppUrl(
  normalized: string | null,
  message: string
): string | null {
  const digits = toWhatsAppDigits(normalized);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/**
 * SMS deep link. The body separator genuinely differs by platform: Android
 * wants `?body=`, iOS wants `&body=`.
 *
 * Takes the RAW number - SMS works with whatever string the OS gave us, so
 * normalization failure must not block this path.
 */
export function smsUrl(rawPhone: string, message: string): string | null {
  const phone = rawPhone.trim();
  if (!phone) return null;
  const separator = Platform.OS === "ios" ? "&" : "?";
  return `sms:${phone}${separator}body=${encodeURIComponent(message)}`;
}

export interface SendOptions {
  whatsApp: string | null;
  sms: string | null;
  /** Which button gets visual emphasis. */
  primary: "whatsapp" | "sms";
  normalizationFailed: boolean;
  /** User-facing explanation when WhatsApp had to be skipped. */
  notice: string | null;
}

/**
 * Both send options for a recipient, with emphasis decided.
 *
 * Deliberately NO automatic WhatsApp -> SMS fallback chain: Linking.openURL
 * resolving only means an app opened, not that a message was composed, so an
 * automatic chain would fire for cases that actually worked. Both buttons are
 * shown and the user picks.
 *
 * There is no API to check whether a number is registered on WhatsApp. That
 * case will happen; the only mitigation is SMS being one tap away.
 */
export function buildSendOptions(
  rawPhone: string,
  message: string
): SendOptions {
  const normalized = normalizePhone(rawPhone);
  const whatsApp = whatsAppUrl(normalized, message);
  const sms = smsUrl(rawPhone, message);
  const normalizationFailed = !!rawPhone.trim() && !normalized;

  return {
    whatsApp,
    sms,
    primary: whatsApp ? "whatsapp" : "sms",
    normalizationFailed,
    notice: normalizationFailed
      ? "Couldn't read this number for WhatsApp — SMS will be used."
      : null,
  };
}
