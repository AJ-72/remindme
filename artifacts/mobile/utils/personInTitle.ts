/**
 * Reads a person's name out of a reminder title, so the composer can offer to
 * SEND the reminder to them rather than only ring the user about them.
 *
 * This is a suggestion, never an action: everything here is a guess about a
 * free-text sentence, and the only thing a wrong guess costs is a chip the
 * user ignores. That budget is what allows the patterns below to stay simple.
 * It is deliberately NOT a general named-entity recogniser - it looks for the
 * two shapes that carry a person in this app's own reminders:
 *
 *   English  - an addressing verb, then a name   ("Call Amma", "Tell Priya ...")
 *   Malayalam - a name carrying a dative/accusative suffix ("പ്രിയയോട് പറയണം")
 *
 * `MALAYALAM_RANGE` is not re-declared here; parseNaturalLanguage.ts owns it.
 */

/** Verbs that address a person rather than describe a task. */
const ADDRESSING_VERBS = [
  "call",
  "ring",
  "tell",
  "ask",
  "remind",
  "text",
  "message",
  "msg",
  "ping",
  "email",
  "mail",
  "wish",
  "thank",
  "meet",
  "pay",
];

/** Filler that may sit between the verb and the name. */
const FILLERS = ["to", "the", "my", "up", "back"];

/**
 * Capitalised words that are never a person. Weekdays and months reach the
 * candidate slot often ("Call Monday" is rare, but "Remind Friday" is not),
 * and a date word picked up as a name would put a stranger's name on a chip.
 */
const NOT_A_NAME = new Set([
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
  "today", "tomorrow", "tonight", "yesterday", "morning", "afternoon",
  "evening", "night", "everyone", "everybody", "someone", "somebody",
  "them", "him", "her", "me", "us", "it",
]);

/**
 * Kinship words, which people use instead of a name and never capitalise
 * reliably. Both scripts' speakers here write these in Latin letters, so they
 * are matched case-insensitively where a capital is otherwise required.
 */
const KINSHIP = new Set([
  "amma", "achan", "acha", "appa", "ammu", "chettan", "chechi", "ettan",
  "mom", "mum", "mummy", "mama", "dad", "daddy", "papa", "pa", "ma",
  "bro", "sis", "wife", "husband",
]);

/** A name proper: one capital, then lower case. Rules out ACRONYMS and words. */
const CAPITALISED = /^[A-Z][a-z'’]+$/;

/**
 * Suffixes that mark the addressed person in Malayalam. The stem in front of
 * one of these is the name: പ്രിയ + യോട്, അമ്മ + യെ.
 */
const ML_SUFFIXES = ["യോട്", "ോട്", "യെ"];

/** Below this a stem is a fragment, not a name. */
const MIN_ML_STEM = 2;

function fromMalayalam(title: string): string | null {
  for (const word of title.split(/\s+/)) {
    for (const suffix of ML_SUFFIXES) {
      if (!word.endsWith(suffix)) continue;
      const stem = word.slice(0, word.length - suffix.length);
      if (stem.length >= MIN_ML_STEM) return stem;
    }
  }
  return null;
}

function fromEnglish(title: string): string | null {
  const words = title.split(/\s+/).filter((w) => w !== "");
  if (words.length < 2) return null;

  const verb = words[0].toLowerCase().replace(/[^a-z]/g, "");
  if (!ADDRESSING_VERBS.includes(verb)) return null;

  for (let i = 1; i < words.length; i += 1) {
    const raw = words[i].replace(/[^A-Za-z'’]/g, "");
    if (raw === "") continue;
    const lower = raw.toLowerCase();
    if (FILLERS.includes(lower)) continue;
    if (NOT_A_NAME.has(lower)) return null;
    if (KINSHIP.has(lower)) {
      // Rendered as the user wrote it where they capitalised it, and with a
      // capital where they did not - a chip reading "send to amma" looks
      // like a typo in the app's own voice.
      return raw[0].toUpperCase() + raw.slice(1);
    }
    if (CAPITALISED.test(raw)) return raw;
    return null;
  }
  return null;
}

/**
 * Returns the person this title addresses, or null when it addresses nobody.
 * Malayalam is tried first: a mixed-script line carries the name in the
 * Malayalam clause, and the English branch would read its first word as a verb.
 */
export function detectPersonInTitle(title: string): string | null {
  const trimmed = title.trim();
  if (trimmed === "") return null;
  return fromMalayalam(trimmed) ?? fromEnglish(trimmed);
}
