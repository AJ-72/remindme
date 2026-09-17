/**
 * Content for the coach-mark feature tour. One entry per step; kept as data
 * so the same list drives both the auto-started first-run tour and the
 * on-demand replay from Settings - one source of content, two triggers.
 *
 * `route` is the screen the step's target lives on. TourContext navigates
 * there automatically when a step's route differs from the current one.
 * `targetId` must match a testID registered via useTourTarget on that
 * screen. A step with no targetId (or whose target never registers, e.g.
 * an empty reminder list on a fresh install) renders as a centered card
 * with no spotlight instead of being skipped - see TourOverlay.
 */
export interface TourStep {
  id: string;
  route: "/(tabs)" | "/(tabs)/settings";
  targetId?: string;
  title: string;
  body: string;
}

export const FEATURE_TOUR_STEPS: TourStep[] = [
  {
    id: "quick-add",
    route: "/(tabs)",
    targetId: "quick-add-input",
    title: "Add a reminder in plain words",
    body: 'Type something like "Call mom tomorrow at 5pm" and the app picks out the time for you.',
  },
  {
    id: "dictation",
    route: "/(tabs)",
    targetId: "quick-add-mic",
    title: "Or just say it",
    body: "Tap the mic to dictate a reminder in English or Malayalam.",
  },
  {
    id: "snooze",
    route: "/(tabs)",
    title: "Running late? Snooze it",
    body: "Open a reminder and tap Snooze to push it back a bit - no need to delete and retype it.",
  },
  {
    id: "insights",
    route: "/(tabs)",
    targetId: "header-insights-button",
    title: "See how you're doing",
    body: "Insights shows your completion rate and which times of day work best for you.",
  },
  {
    id: "remind-someone",
    route: "/(tabs)",
    targetId: "quick-add-remind-someone",
    title: "Remind someone else",
    body: "Send a reminder straight to another person's phone, not just your own.",
  },
  {
    id: "smart-alerts",
    route: "/(tabs)/settings",
    targetId: "smart-alerts-row",
    title: "Fewer pings, better timed",
    body: "Smart Alerts lets you set quiet hours so reminders don't ring when you don't want them to.",
  },
];
