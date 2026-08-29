import { PersonaProfile, PersonaType, QuizQuestion } from "@/types/persona";

export const DEFAULT_PERSONA_TYPE: PersonaType = "step_by_step_doer";

export const PERSONA_PROFILES: Record<PersonaType, PersonaProfile> = {
  busy_juggler: {
    id: "busy_juggler",
    name: "Busy Juggler",
    badge: "🤹",
    tagline: "Managing a lot on your plate",
    description:
      "You are constantly switching contexts across work, family, and personal tasks. You don't postpone out of laziness—you postpone because your schedule is packed.",
    slipReason: "Too many active demands competing for the exact same moment.",
    recommendation:
      "15-minute advance heads-up notifications with calm, non-nagging follow-ups.",
    adaptations: {
      leadTimeMinutes: 15,
      alarm: true,
      vibration: true,
      defaultSnoozeMinutes: 15,
      tone: "Calm & supportive",
      followUpStrategy:
        "Gentle, respectful reminders that avoid adding urgency stress",
    },
  },
  step_by_step_doer: {
    id: "step_by_step_doer",
    name: "Step-by-Step Doer",
    badge: "🎯",
    tagline: "Thrives on tiny first moves",
    description:
      "Tasks that feel big, vague, or uncomfortable trigger natural friction. Postponing gives temporary relief, but starting with just two minutes builds effortless momentum.",
    slipReason:
      "Initial task dread makes starting feel much harder than doing.",
    recommendation:
      "Micro-snoozes (5 mins) and the 2-minute rule prompt when tasks slip.",
    adaptations: {
      leadTimeMinutes: 0,
      alarm: true,
      vibration: true,
      defaultSnoozeMinutes: 5,
      tone: "Encouraging & actionable",
      followUpStrategy:
        "Offers the 2-minute breakdown nudge after repeated snoozes",
    },
  },
  quick_finisher: {
    id: "quick_finisher",
    name: "Quick Finisher",
    badge: "⚡",
    tagline: "Decisive, direct, and prompt",
    description:
      "You prefer handling tasks immediately or rescheduling them cleanly. You value focused simplicity and dislike cluttered notifications.",
    slipReason:
      "Only slips when unexpected external blockers or emergencies intervene.",
    recommendation:
      "On-time, quiet alerts that give the essentials and stay out of the way.",
    adaptations: {
      leadTimeMinutes: 0,
      alarm: false,
      vibration: true,
      defaultSnoozeMinutes: 30,
      tone: "Crisp & direct",
      followUpStrategy:
        "Minimal single alert with zero unnecessary follow-up clutter",
    },
  },
  deep_focuser: {
    id: "deep_focuser",
    name: "Deep Focuser",
    badge: "🌊",
    tagline: "Gets deeply absorbed in flow",
    description:
      "When you get into a zone, time slips past unnoticed. A subtle notification is easy to miss when you're immersed in deep focus.",
    slipReason:
      "Time-blindness during deep flow states leads to missed deadlines.",
    recommendation:
      "10-minute early heads-up plus distinct alarm sounds and vibration.",
    adaptations: {
      leadTimeMinutes: 10,
      alarm: true,
      vibration: true,
      defaultSnoozeMinutes: 10,
      tone: "Time-anchored & prominent",
      followUpStrategy:
        "Distinct audible alert and advance heads-up before the moment arrives",
    },
  },
};

export const ALL_PERSONAS: readonly PersonaProfile[] = [
  PERSONA_PROFILES.busy_juggler,
  PERSONA_PROFILES.step_by_step_doer,
  PERSONA_PROFILES.quick_finisher,
  PERSONA_PROFILES.deep_focuser,
];

export const QUIZ_QUESTIONS: readonly QuizQuestion[] = [
  {
    id: "reaction",
    title: "When a reminder rings, what usually happens?",
    subtitle: "Be honest—there are no wrong answers.",
    choices: [
      {
        id: "r1",
        text: "I'm in deep focus and lose track of the alert",
        personaTarget: "deep_focuser",
      },
      {
        id: "r2",
        text: "I feel resistance/dread and put it off till later",
        personaTarget: "step_by_step_doer",
      },
      {
        id: "r3",
        text: "I'm already in the middle of 3 other things",
        personaTarget: "busy_juggler",
      },
      {
        id: "r4",
        text: "I quickly get it done or reschedule right away",
        personaTarget: "quick_finisher",
      },
    ],
  },
  {
    id: "reason",
    title: "What is the biggest reason tasks slip for you?",
    subtitle: "Understanding your slip trigger helps customize smart alerts.",
    choices: [
      {
        id: "q1",
        text: "Sheer volume—too much on my plate at once",
        personaTarget: "busy_juggler",
      },
      {
        id: "q2",
        text: "Tasks feel too big or vague to get started",
        personaTarget: "step_by_step_doer",
      },
      {
        id: "q3",
        text: "Getting absorbed in something else and losing track of time",
        personaTarget: "deep_focuser",
      },
      {
        id: "q4",
        text: "They rarely slip unless a high-priority emergency happens",
        personaTarget: "quick_finisher",
      },
    ],
  },
  {
    id: "help",
    title: "How would you like RemindMe to help you most?",
    subtitle: "We'll tune your default notifications based on this.",
    choices: [
      {
        id: "h1",
        text: "Give me an advance heads-up before the time arrives",
        personaTarget: "busy_juggler",
      },
      {
        id: "h2",
        text: "Break things down with 2-minute steps when I postpone",
        personaTarget: "step_by_step_doer",
      },
      {
        id: "h3",
        text: "Keep notifications loud and persistent so I can't miss them",
        personaTarget: "deep_focuser",
      },
      {
        id: "h4",
        text: "Keep alerts minimal, concise, and out of my way",
        personaTarget: "quick_finisher",
      },
    ],
  },
];
