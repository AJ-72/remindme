import { DEFAULT_PERSONA_TYPE } from "@/constants/personas";
import { PersonaType } from "@/types/persona";

const PERSONA_ORDER: readonly PersonaType[] = [
  "step_by_step_doer",
  "busy_juggler",
  "deep_focuser",
  "quick_finisher",
];

/**
 * Calculates the winning PersonaType based on an array of chosen persona targets.
 * Deterministic and safe against ties and empty inputs.
 */
export function calculatePersonaFromChoices(
  choices: readonly (PersonaType | null | undefined)[]
): PersonaType {
  const validChoices = choices.filter(
    (c): c is PersonaType => typeof c === "string" && c in {
      busy_juggler: true,
      step_by_step_doer: true,
      quick_finisher: true,
      deep_focuser: true,
    }
  );

  if (validChoices.length === 0) {
    return DEFAULT_PERSONA_TYPE;
  }

  const counts: Record<PersonaType, number> = {
    busy_juggler: 0,
    step_by_step_doer: 0,
    quick_finisher: 0,
    deep_focuser: 0,
  };

  for (const choice of validChoices) {
    counts[choice] += 1;
  }

  let maxCount = 0;
  let winner: PersonaType = DEFAULT_PERSONA_TYPE;

  // Evaluate in priority tie-breaker order
  for (const persona of PERSONA_ORDER) {
    if (counts[persona] > maxCount) {
      maxCount = counts[persona];
      winner = persona;
    }
  }

  return winner;
}
