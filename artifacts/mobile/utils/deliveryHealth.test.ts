import { assessDelivery, type DeliveryInputs } from "./deliveryHealth";

const allGood: DeliveryInputs = {
  notificationsGranted: true,
  channelLevel: "normal",
  exactAlarm: true,
  ignoringBatteryOptimizations: true,
};

function statusOf(inputs: DeliveryInputs, id: string) {
  return assessDelivery(inputs).checks.find((c) => c.id === id)?.status;
}

describe("assessDelivery", () => {
  it("reports ok overall when every check passes", () => {
    const r = assessDelivery(allGood);
    expect(r.overall).toBe("ok");
    expect(r.checks.map((c) => c.id)).toEqual([
      "notifications",
      "channel",
      "exact_alarm",
      "battery",
    ]);
    expect(r.checks.every((c) => c.status === "ok")).toBe(true);
  });

  it("flags denied notification permission as a problem", () => {
    const r = assessDelivery({ ...allGood, notificationsGranted: false });
    expect(statusOf({ ...allGood, notificationsGranted: false }, "notifications")).toBe("problem");
    expect(r.overall).toBe("problem");
  });

  it("flags a blocked channel and a quiet channel as problems", () => {
    expect(statusOf({ ...allGood, channelLevel: "blocked" }, "channel")).toBe("problem");
    expect(statusOf({ ...allGood, channelLevel: "quiet" }, "channel")).toBe("problem");
  });

  it("flags exact alarms off as a problem", () => {
    expect(statusOf({ ...allGood, exactAlarm: false }, "exact_alarm")).toBe("problem");
  });

  it("flags battery optimization on as a problem", () => {
    expect(statusOf({ ...allGood, ignoringBatteryOptimizations: false }, "battery")).toBe("problem");
  });

  it("treats null readings as unknown, never as ok", () => {
    const r = assessDelivery({
      notificationsGranted: true,
      channelLevel: null,
      exactAlarm: null,
      ignoringBatteryOptimizations: null,
    });
    expect(r.checks.filter((c) => c.status === "unknown").map((c) => c.id)).toEqual([
      "channel",
      "exact_alarm",
      "battery",
    ]);
    expect(r.overall).toBe("unknown");
  });

  it("a problem outranks unknowns in the overall verdict", () => {
    const r = assessDelivery({
      notificationsGranted: false,
      channelLevel: null,
      exactAlarm: null,
      ignoringBatteryOptimizations: null,
    });
    expect(r.overall).toBe("problem");
  });

  it("resolves an unknown reading to ok when confirmed by a successful test fire", () => {
    const r = assessDelivery(
      { ...allGood, exactAlarm: null, ignoringBatteryOptimizations: null },
      true
    );
    expect(r.checks.find((c) => c.id === "exact_alarm")?.status).toBe("ok");
    expect(r.checks.find((c) => c.id === "battery")?.status).toBe("ok");
    expect(r.overall).toBe("ok");
  });

  it("does not let a test-fire confirmation upgrade a confirmed problem", () => {
    const r = assessDelivery(
      { ...allGood, ignoringBatteryOptimizations: false, exactAlarm: null },
      true
    );
    expect(r.checks.find((c) => c.id === "battery")?.status).toBe("problem");
    expect(r.checks.find((c) => c.id === "exact_alarm")?.status).toBe("ok");
    expect(r.overall).toBe("problem");
  });

  it("gives every problem a fix action", () => {
    const r = assessDelivery({
      notificationsGranted: false,
      channelLevel: "blocked",
      exactAlarm: false,
      ignoringBatteryOptimizations: false,
    });
    for (const c of r.checks) {
      expect(c.status).toBe("problem");
      expect(c.fix).toBeDefined();
    }
    expect(r.checks.find((c) => c.id === "exact_alarm")?.fix).toBe("exact_alarm_settings");
    expect(r.checks.find((c) => c.id === "battery")?.fix).toBe("battery_settings");
  });
});
