import { addIncomingCallActivity } from "@/plugins/withIncomingCall";

function callActivities(application: any) {
  return (application.activity ?? []).filter(
    (a: any) => a.$["android:name"] === ".IncomingCallActivity"
  );
}

describe("withIncomingCall (B24)", () => {
  it("registers a non-exported activity that can show over the lock screen", () => {
    const application: any = { activity: [{ $: { "android:name": ".MainActivity" } }] };
    addIncomingCallActivity(application);
    const [activity] = callActivities(application);
    expect(activity.$["android:exported"]).toBe("false");
    expect(activity.$["android:showWhenLocked"]).toBe("true");
    expect(activity.$["android:turnScreenOn"]).toBe("true");
  });

  // The lock-screen flags must never land on MainActivity: that would show
  // every reminder over the keyguard (the reason this is a separate screen).
  it("leaves MainActivity without lock-screen flags", () => {
    const application: any = { activity: [{ $: { "android:name": ".MainActivity" } }] };
    addIncomingCallActivity(application);
    expect(application.activity[0].$["android:showWhenLocked"]).toBeUndefined();
  });

  it("is idempotent across repeated prebuilds", () => {
    const application: any = {};
    addIncomingCallActivity(application);
    addIncomingCallActivity(application);
    expect(callActivities(application)).toHaveLength(1);
  });
});
