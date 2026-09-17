import { scrubEvent } from "@/services/CrashReportingService";

describe("scrubEvent", () => {
  it("drops the user object and any request body", () => {
    const event = scrubEvent({
      user: { id: "someone", email: "a@b.com" },
      request: { url: "https://example.test", data: { title: "buy milk" } },
    });

    expect(event.user).toBeUndefined();
    expect(event.request.data).toBeUndefined();
    expect(event.request.url).toBe("https://example.test");
  });

  it("redacts Malayalam text, which in this app is always user content", () => {
    const event = scrubEvent({
      message: "parse failed for രാവിലെ 5 ആപ്പിൾ വാങ്ങണം",
    });

    expect(event.message).toBe("[redacted]");
  });

  it("redacts anything shaped like a phone number", () => {
    const event = scrubEvent({
      extra: { recipient: "+91 98470 12345", step: "lookup" },
    });

    expect(event.extra.recipient).toBe("[redacted]");
    // English app-generated strings are what makes a report readable, so they
    // must survive the scrub.
    expect(event.extra.step).toBe("lookup");
  });

  it("redacts inside exception values and breadcrumbs", () => {
    const event = scrubEvent({
      exception: { values: [{ value: "could not schedule ഓർമ്മപ്പെടുത്തൽ" }] },
      breadcrumbs: [{ message: "calling +919876543210" }],
    });

    expect(event.exception.values[0].value).toBe("[redacted]");
    expect(event.breadcrumbs[0].message).toBe("[redacted]");
  });

  it("passes ordinary reports through untouched", () => {
    const event = scrubEvent({
      message: "TypeError: cannot read property id of undefined",
      extra: { screen: "reminder-detail", count: 3 },
    });

    expect(event.message).toBe("TypeError: cannot read property id of undefined");
    expect(event.extra).toEqual({ screen: "reminder-detail", count: 3 });
  });
});
