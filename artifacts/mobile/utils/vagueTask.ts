import { MALAYALAM_RANGE } from "@/utils/parseNaturalLanguage";

/**
 * Openers that name an intention rather than an action.
 *
 * Deliberately short. A broad list fires on ordinary tasks, and an advisory
 * hint that cries wolf is one the user learns to dismiss without reading -
 * which costs more than never having shown it.
 *
 * English only, by design: this heuristic depends on the verb coming FIRST,
 * and Malayalam verbs are final and inflected. Deferred for the same reason
 * as INVITE_NUDGES_ML in utils/inviteNudges.ts - it needs a native speaker to
 * write, not a translation.
 */
export const VAGUE_OPENERS = [
  "sort out",
  "deal with",
  "look into",
  "figure out",
  "think about",
  "organise",
  "organize",
  "handle",
  "review",
  "plan",
] as const;

/**
 * The vague opener this title starts with, or null.
 *
 * Matches only at the START: "Call the bank to sort out the fee" already names
 * a first action and must not be flagged.
 */
export function detectVagueOpener(title: string): string | null {
  const trimmed = title.trim();
  if (!trimmed) return null;
  // The heuristic does not transfer to Malayalam; do not guess there.
  if (MALAYALAM_RANGE.test(trimmed)) return null;

  const lower = trimmed.toLowerCase();
  for (const opener of VAGUE_OPENERS) {
    if (!lower.startsWith(opener)) continue;
    // Require a boundary so "plan" does not match "Planning permission".
    const next = lower.charAt(opener.length);
    if (next === "" || next === " ") return opener;
  }
  return null;
}
