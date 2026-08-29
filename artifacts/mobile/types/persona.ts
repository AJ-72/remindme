export type PersonaType =
  | "busy_juggler"
  | "step_by_step_doer"
  | "quick_finisher"
  | "deep_focuser";

export interface PersonaAdaptations {
  /** Advance notification lead time in minutes before reminder time (0 = on time). */
  leadTimeMinutes: number;
  /** Whether alarms play sound by default. */
  alarm: boolean;
  /** Whether notifications vibrate by default. */
  vibration: boolean;
  /** Default snooze duration in minutes. */
  defaultSnoozeMinutes: number;
  /** Primary communication and notification tone description. */
  tone: string;
  /** Follow-up and anti-procrastination strategy summary. */
  followUpStrategy: string;
}

export interface PersonaProfile {
  id: PersonaType;
  name: string;
  badge: string;
  tagline: string;
  description: string;
  slipReason: string;
  recommendation: string;
  adaptations: PersonaAdaptations;
}

export interface QuizChoice {
  id: string;
  text: string;
  personaTarget: PersonaType;
}

export interface QuizQuestion {
  id: string;
  title: string;
  subtitle?: string;
  choices: QuizChoice[];
}
