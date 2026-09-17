import {
  __resetAnalyticsForTests,
  __setAnalyticsClientForTests,
  applyTelemetryChoice,
  initAnalytics,
  setPersonProperties,
  track,
  trackScreen,
} from "@/services/AnalyticsService";
import {
  __resetTelemetryConsentCache,
  isTelemetryEnabledSync,
  setTelemetryEnabled,
} from "@/services/telemetryConsent";
import { EVENTS } from "@/constants/analytics";

function fakeClient() {
  return {
    capture: jest.fn(),
    screen: jest.fn(),
    optIn: jest.fn(),
    optOut: jest.fn(),
    flush: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(async () => {
  __resetAnalyticsForTests();
  __resetTelemetryConsentCache();
  await setTelemetryEnabled(true);
});

describe("AnalyticsService", () => {
  it("does nothing at all without a configured key", async () => {
    // EXPO_PUBLIC_POSTHOG_KEY is unset under Jest, which is the point: the
    // whole suite must run without a client ever being constructed.
    await initAnalytics();
    expect(() => track(EVENTS.REMINDER_CREATED, { lead_time: "same_day" })).not.toThrow();
  });

  it("captures events through the client once one exists", () => {
    const client = fakeClient();
    __setAnalyticsClientForTests(client);

    track(EVENTS.REMINDER_CREATED, { lead_time: "same_day" });

    expect(client.capture).toHaveBeenCalledWith("reminder_created", {
      lead_time: "same_day",
    });
  });

  it("sends nothing once the user opts out", async () => {
    const client = fakeClient();
    __setAnalyticsClientForTests(client);

    await applyTelemetryChoice(false);
    track(EVENTS.REMINDER_COMPLETED);
    trackScreen("insights");
    setPersonProperties({ dictation_language: "ml-IN" });

    expect(client.capture).not.toHaveBeenCalled();
    expect(client.screen).not.toHaveBeenCalled();
    // The SDK is told to stop as well, so anything already queued and unsent
    // is dropped rather than delivered after the user said no.
    expect(client.optOut).toHaveBeenCalled();
    expect(isTelemetryEnabledSync()).toBe(false);
  });

  it("resumes on opt-in", async () => {
    const client = fakeClient();
    __setAnalyticsClientForTests(client);

    await applyTelemetryChoice(false);
    await applyTelemetryChoice(true);
    track(EVENTS.REMINDER_COMPLETED);

    expect(client.optIn).toHaveBeenCalled();
    expect(client.capture).toHaveBeenCalledWith("reminder_completed", {});
  });

  it("never lets a failing client break the caller", () => {
    __setAnalyticsClientForTests({
      capture: () => {
        throw new Error("network down");
      },
    });

    // The contract the whole app depends on: saving a reminder must not fail
    // because a telemetry endpoint did.
    expect(() => track(EVENTS.REMINDER_CREATED)).not.toThrow();
  });
});
