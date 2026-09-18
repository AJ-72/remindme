import {
  computeNextOccurrence,
  describeRecurrence,
  parseRecurrencePhrase,
  type RecurrenceRule,
} from "./recurrence";

describe("computeNextOccurrence", () => {
  describe("daily", () => {
    it("adds 1 day, preserving clock time, for interval 1", () => {
      const from = new Date(2026, 0, 15, 9, 30, 0);
      const rule: RecurrenceRule = { freq: "daily", interval: 1 };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2026, 0, 16, 9, 30, 0));
    });

    it("adds N days for interval N", () => {
      const from = new Date(2026, 0, 15, 9, 30, 0);
      const rule: RecurrenceRule = { freq: "daily", interval: 3 };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2026, 0, 18, 9, 30, 0));
    });
  });

  describe("weekly", () => {
    it("adds 7xN days when no byWeekday given", () => {
      const from = new Date(2026, 0, 15, 9, 30, 0); // Thursday
      const rule: RecurrenceRule = { freq: "weekly", interval: 2 };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2026, 0, 29, 9, 30, 0));
    });

    it("advances to the next listed weekday within the same week", () => {
      // 2026-01-15 is a Thursday (4). byWeekday includes Sat (6).
      const from = new Date(2026, 0, 15, 9, 30, 0);
      const rule: RecurrenceRule = { freq: "weekly", interval: 1, byWeekday: [1, 6] };
      const next = computeNextOccurrence(rule, from);
      // Next Saturday is 2026-01-17
      expect(next).toEqual(new Date(2026, 0, 17, 9, 30, 0));
    });

    it("wraps to the following week (xN) after the last listed weekday", () => {
      // Thursday 2026-01-15, byWeekday = [1] (Monday only) => next Monday is 2026-01-19
      const from = new Date(2026, 0, 15, 9, 30, 0);
      const rule: RecurrenceRule = { freq: "weekly", interval: 1, byWeekday: [1] };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2026, 0, 19, 9, 30, 0));
    });

    it("wraps by N weeks (not just 1) once past the last listed weekday", () => {
      // Thursday 2026-01-15, byWeekday = [1] (Monday only), interval 2
      // Next Monday within cycle skipped since interval 2 means wrap adds 2 weeks from that Monday's base week.
      const from = new Date(2026, 0, 15, 9, 30, 0);
      const rule: RecurrenceRule = { freq: "weekly", interval: 2, byWeekday: [1] };
      const next = computeNextOccurrence(rule, from);
      // Immediate next Monday (2026-01-19) is in the "current" week boundary from `from`;
      // since interval is 2, wrapping should land 2 weeks after the week containing `from`.
      expect(next).toEqual(new Date(2026, 0, 26, 9, 30, 0));
    });

    it("handles unsorted and duplicate-containing byWeekday without misbehaving", () => {
      const from = new Date(2026, 0, 15, 9, 30, 0); // Thursday
      const rule: RecurrenceRule = { freq: "weekly", interval: 1, byWeekday: [6, 1, 1, 6] };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2026, 0, 17, 9, 30, 0));
    });
  });

  describe("monthly", () => {
    it("keeps same day-of-month, N months on", () => {
      const from = new Date(2026, 0, 10, 9, 30, 0);
      const rule: RecurrenceRule = { freq: "monthly", interval: 1 };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2026, 1, 10, 9, 30, 0));
    });

    it("clamps Jan 31 + 1 month to Feb 28 in a non-leap year", () => {
      const from = new Date(2026, 0, 31, 9, 30, 0); // 2026 is not a leap year
      const rule: RecurrenceRule = { freq: "monthly", interval: 1 };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2026, 1, 28, 9, 30, 0));
    });

    it("clamps Jan 31 + 1 month to Feb 29 in a leap year", () => {
      const from = new Date(2028, 0, 31, 9, 30, 0); // 2028 is a leap year
      const rule: RecurrenceRule = { freq: "monthly", interval: 1 };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2028, 1, 29, 9, 30, 0));
    });
  });

  describe("yearly", () => {
    it("keeps same month/day, N years on", () => {
      const from = new Date(2026, 8, 18, 9, 30, 0);
      const rule: RecurrenceRule = { freq: "yearly", interval: 1 };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2027, 8, 18, 9, 30, 0));
    });

    it("clamps Feb 29 to Feb 28 in a non-leap target year", () => {
      const from = new Date(2028, 1, 29, 9, 30, 0); // 2028 leap year
      const rule: RecurrenceRule = { freq: "yearly", interval: 1 };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2029, 1, 28, 9, 30, 0));
    });
  });

  describe("DST", () => {
    // This dev/CI environment's ambient timezone (Asia/Calcutta) never
    // observes DST, so running this assertion under the ambient TZ would
    // pass even with the exact buggy millisecond-addition implementation
    // this test exists to catch (adding 86400000ms always lands on the same
    // wall-clock time when the UTC offset never changes) — an offset-blind
    // test proves nothing about DST correctness.
    //
    // Setting process.env.TZ *inside* a running Jest test does not work:
    // confirmed by hand that Jest/jest-expo resolve the worker's ICU
    // timezone before any test file's own code runs at all (even before the
    // file's top-level statements), so an in-test mutation of
    // process.env.TZ is always too late — Intl/Date keep resolving to the
    // ambient zone regardless of any later reassignment. The only reliable
    // way to force a DST-observing zone for a Date computation is to set TZ
    // in a *fresh child process's* environment before that process starts.
    //
    // So this test transpiles the real recurrence.ts source with the
    // TypeScript compiler API (`ts.transpileModule` — already a project
    // dependency, no extra tooling needed) and runs the actual, unmodified
    // computeNextOccurrence against a `node -e` child process spawned with
    // TZ="America/New_York" in its env. This exercises the real
    // implementation, not a re-description of it. A second, clearly-labeled
    // buggy ms-addition snippet runs in the same child alongside it purely
    // as the falsification check (see below) — it is not itself under test.
    //
    // Hand-verified (America/New_York, US DST spring-forward is 2026-03-08):
    // from = 2026-03-07 09:30 local (EST, UTC-5).
    //   Buggy (`new Date(from.getTime() + 86400000)`): lands at 2026-03-08
    //   10:30 EDT (UTC-4) — drifts forward an hour because the +24h-in-ms
    //   crosses the UTC-5 -> UTC-4 spring-forward transition.
    //   Real computeNextOccurrence (builds the next Date from local-time
    //   components, per atLocal() in recurrence.ts): lands at 2026-03-08
    //   09:30 EDT — same wall-clock time, different UTC instant, which is
    //   what a human expects from "remind me at 9:30 tomorrow" regardless
    //   of a DST transition in between.
    it("preserves wall-clock time across a DST boundary rather than drifting by an hour", () => {
      const ts = require("typescript") as typeof import("typescript");
      const { execFileSync } = require("node:child_process") as typeof import("node:child_process");
      const fs = require("node:fs") as typeof import("node:fs");
      const path = require("node:path") as typeof import("node:path");
      const os = require("node:os") as typeof import("node:os");

      const recurrenceSrcPath = path.resolve(__dirname, "recurrence.ts");
      const source = fs.readFileSync(recurrenceSrcPath, "utf8");
      const transpiled = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
      }).outputText;

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "recurrence-dst-"));
      const compiledPath = path.join(tmpDir, "recurrence.cjs");
      fs.writeFileSync(compiledPath, transpiled);

      try {
        const childScript = `
          const { computeNextOccurrence } = require(${JSON.stringify(compiledPath)});
          const from = new Date(2026, 2, 7, 9, 30, 0);

          // The real, unmodified implementation under test.
          const real = computeNextOccurrence({ freq: "daily", interval: 1 }, from);

          // Falsification check ONLY: the exact bug the brief warns
          // against (adding raw milliseconds instead of local-time
          // components). Not part of the module under test.
          const buggy = new Date(from.getTime() + 24 * 60 * 60 * 1000);

          console.log(JSON.stringify({
            realHours: real.getHours(),
            realMinutes: real.getMinutes(),
            realDate: real.getDate(),
            realMonth: real.getMonth(),
            buggyHours: buggy.getHours(),
            resolvedTz: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }));
        `;

        const output = execFileSync(process.execPath, ["-e", childScript], {
          env: { ...process.env, TZ: "America/New_York" },
          encoding: "utf8",
        });
        const result = JSON.parse(output.trim());

        // Sanity: the child process actually ran under the pinned DST zone.
        expect(result.resolvedTz).toBe("America/New_York");

        // The real computeNextOccurrence preserves wall-clock time across
        // the spring-forward boundary.
        expect(result.realHours).toBe(9);
        expect(result.realMinutes).toBe(30);
        expect(result.realDate).toBe(8);
        expect(result.realMonth).toBe(2);

        // Falsification check: under this pinned DST-observing TZ, the
        // buggy ms-addition version does NOT preserve wall-clock time
        // (lands at 10:30, not 9:30) — confirming this test actually
        // exercises the DST boundary rather than passing vacuously
        // regardless of implementation.
        expect(result.buggyHours).not.toBe(result.realHours);
        expect(result.buggyHours).toBe(10);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("defensive fallback", () => {
    // Documented fallback: interval < 1, a non-finite `from`, or an unknown
    // `freq` never throws and never loops. In each case we fall back to
    // treating the rule as if it were { freq: "daily", interval: 1 }
    // anchored at `from` (or at "now" if `from` itself is invalid), so the
    // function always returns *some* valid, strictly-later Date rather than
    // throwing or hanging. This keeps every caller (scheduling code) simple:
    // it never has to guard against an exception or an infinite computation
    // from a malformed rule, and a malformed rule degrades to "remind me
    // again tomorrow" instead of silently vanishing.
    it("treats interval < 1 as interval 1", () => {
      const from = new Date(2026, 0, 15, 9, 30, 0);
      const rule: RecurrenceRule = { freq: "daily", interval: 0 };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2026, 0, 16, 9, 30, 0));
    });

    it("treats a negative interval as interval 1", () => {
      const from = new Date(2026, 0, 15, 9, 30, 0);
      const rule: RecurrenceRule = { freq: "weekly", interval: -5 };
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2026, 0, 22, 9, 30, 0));
    });

    it("does not throw or loop for a non-finite `from`, returning a valid Date strictly after now", () => {
      const rule: RecurrenceRule = { freq: "daily", interval: 1 };
      const before = Date.now();
      const next = computeNextOccurrence(rule, new Date(NaN));
      expect(Number.isFinite(next.getTime())).toBe(true);
      expect(next.getTime()).toBeGreaterThan(before);
    });

    it("treats an unknown freq as daily interval 1", () => {
      const from = new Date(2026, 0, 15, 9, 30, 0);
      const rule = { freq: "fortnightly", interval: 1 } as unknown as RecurrenceRule;
      const next = computeNextOccurrence(rule, from);
      expect(next).toEqual(new Date(2026, 0, 16, 9, 30, 0));
    });
  });
});

describe("describeRecurrence", () => {
  it("describes daily interval 1 as 'Daily'", () => {
    expect(describeRecurrence({ freq: "daily", interval: 1 })).toBe("Daily");
  });

  it("describes daily interval N as 'Every N days'", () => {
    expect(describeRecurrence({ freq: "daily", interval: 2 })).toBe("Every 2 days");
  });

  it("describes weekly interval 1 with no byWeekday as 'Weekly'", () => {
    expect(describeRecurrence({ freq: "weekly", interval: 1 })).toBe("Weekly");
  });

  it("describes weekly interval N with no byWeekday as 'Every N weeks'", () => {
    expect(describeRecurrence({ freq: "weekly", interval: 3 })).toBe("Every 3 weeks");
  });

  it("describes weekly with byWeekday as 'Weekly on Mon, Wed'", () => {
    expect(describeRecurrence({ freq: "weekly", interval: 1, byWeekday: [1, 3] })).toBe(
      "Weekly on Mon, Wed"
    );
  });

  it("sorts and dedupes byWeekday in the description regardless of input order", () => {
    expect(describeRecurrence({ freq: "weekly", interval: 1, byWeekday: [3, 1, 1] })).toBe(
      "Weekly on Mon, Wed"
    );
  });

  it("describes monthly interval 1 as 'Monthly on the Nth'", () => {
    const rule: RecurrenceRule = { freq: "monthly", interval: 1 };
    // Anchor day is not part of the rule itself; description uses the rule
    // alone plus an optional anchor date. Test via describeRecurrence(rule, anchor).
    expect(describeRecurrence(rule, new Date(2026, 0, 15))).toBe("Monthly on the 15th");
  });

  it("describes monthly interval N as 'Every N months on the Nth'", () => {
    const rule: RecurrenceRule = { freq: "monthly", interval: 2 };
    expect(describeRecurrence(rule, new Date(2026, 0, 1))).toBe("Every 2 months on the 1st");
  });

  it("describes yearly as 'Yearly on 18 Sep'", () => {
    const rule: RecurrenceRule = { freq: "yearly", interval: 1 };
    expect(describeRecurrence(rule, new Date(2026, 8, 18))).toBe("Yearly on 18 Sep");
  });

  it("describes yearly interval N as 'Every N years on 18 Sep'", () => {
    const rule: RecurrenceRule = { freq: "yearly", interval: 3 };
    expect(describeRecurrence(rule, new Date(2026, 8, 18))).toBe("Every 3 years on 18 Sep");
  });
});

describe("parseRecurrencePhrase", () => {
  it("matches 'every day'", () => {
    const result = parseRecurrencePhrase("every day");
    expect(result).toEqual({
      rule: { freq: "daily", interval: 1 },
      match: { start: 0, end: 9 },
    });
  });

  it("matches 'daily'", () => {
    const result = parseRecurrencePhrase("take pills daily please");
    expect(result?.rule).toEqual({ freq: "daily", interval: 1 });
    expect(result?.match).toEqual({ start: 11, end: 16 });
  });

  it("matches 'each day'", () => {
    const result = parseRecurrencePhrase("water plants each day");
    expect(result?.rule).toEqual({ freq: "daily", interval: 1 });
  });

  it("matches 'every weekday' as weekly Mon-Fri", () => {
    const result = parseRecurrencePhrase("gym every weekday");
    expect(result?.rule).toEqual({ freq: "weekly", interval: 1, byWeekday: [1, 2, 3, 4, 5] });
  });

  it("matches 'every weekend' as weekly Sat/Sun", () => {
    const result = parseRecurrencePhrase("clean house every weekend");
    expect(result?.rule).toEqual({ freq: "weekly", interval: 1, byWeekday: [0, 6] });
  });

  it("matches 'every Monday'", () => {
    const result = parseRecurrencePhrase("call mom every Monday");
    expect(result?.rule).toEqual({ freq: "weekly", interval: 1, byWeekday: [1] });
  });

  it("matches 'Mondays' (plural weekday, no 'every')", () => {
    const result = parseRecurrencePhrase("trash pickup Mondays");
    expect(result?.rule).toEqual({ freq: "weekly", interval: 1, byWeekday: [1] });
  });

  it("matches multi-day 'every Monday and Thursday'", () => {
    const result = parseRecurrencePhrase("gym every Monday and Thursday");
    expect(result?.rule).toEqual({ freq: "weekly", interval: 1, byWeekday: [1, 4] });
  });

  it("matches multi-day abbreviated list 'every Mon, Wed, Fri'", () => {
    const result = parseRecurrencePhrase("gym every Mon, Wed, Fri");
    expect(result?.rule).toEqual({ freq: "weekly", interval: 1, byWeekday: [1, 3, 5] });
  });

  it("matches 'every week'", () => {
    const result = parseRecurrencePhrase("standup every week");
    expect(result?.rule).toEqual({ freq: "weekly", interval: 1 });
  });

  it("matches 'weekly'", () => {
    const result = parseRecurrencePhrase("weekly report");
    expect(result?.rule).toEqual({ freq: "weekly", interval: 1 });
  });

  it("matches 'every month'", () => {
    const result = parseRecurrencePhrase("pay rent every month");
    expect(result?.rule).toEqual({ freq: "monthly", interval: 1 });
  });

  it("matches 'monthly'", () => {
    const result = parseRecurrencePhrase("monthly review");
    expect(result?.rule).toEqual({ freq: "monthly", interval: 1 });
  });

  it("matches 'monthly on the 15th'", () => {
    const result = parseRecurrencePhrase("pay rent monthly on the 15th");
    expect(result?.rule).toEqual({ freq: "monthly", interval: 1 });
  });

  it("matches 'monthly on the 1st'", () => {
    const result = parseRecurrencePhrase("review monthly on the 1st");
    expect(result?.rule).toEqual({ freq: "monthly", interval: 1 });
  });

  it("matches 'every year'", () => {
    const result = parseRecurrencePhrase("renew passport every year");
    expect(result?.rule).toEqual({ freq: "yearly", interval: 1 });
  });

  it("matches 'yearly'", () => {
    const result = parseRecurrencePhrase("yearly checkup");
    expect(result?.rule).toEqual({ freq: "yearly", interval: 1 });
  });

  it("matches 'annually'", () => {
    const result = parseRecurrencePhrase("renew license annually");
    expect(result?.rule).toEqual({ freq: "yearly", interval: 1 });
  });

  it("matches 'every 3 days'", () => {
    const result = parseRecurrencePhrase("water plants every 3 days");
    expect(result?.rule).toEqual({ freq: "daily", interval: 3 });
  });

  it("matches 'every 2 weeks'", () => {
    const result = parseRecurrencePhrase("team sync every 2 weeks");
    expect(result?.rule).toEqual({ freq: "weekly", interval: 2 });
  });

  it("matches 'every 6 months'", () => {
    const result = parseRecurrencePhrase("dentist every 6 months");
    expect(result?.rule).toEqual({ freq: "monthly", interval: 6 });
  });

  it("matches 'every 2 years'", () => {
    const result = parseRecurrencePhrase("passport renewal every 2 years");
    expect(result?.rule).toEqual({ freq: "yearly", interval: 2 });
  });

  it("matches 'every other day' as interval 2", () => {
    const result = parseRecurrencePhrase("water plants every other day");
    expect(result?.rule).toEqual({ freq: "daily", interval: 2 });
  });

  it("matches 'every other week' as interval 2", () => {
    const result = parseRecurrencePhrase("trash every other week");
    expect(result?.rule).toEqual({ freq: "weekly", interval: 2 });
  });

  it("matches 'every other month' as interval 2", () => {
    const result = parseRecurrencePhrase("billing every other month");
    expect(result?.rule).toEqual({ freq: "monthly", interval: 2 });
  });

  it("matches 'every other year' as interval 2", () => {
    const result = parseRecurrencePhrase("checkup every other year");
    expect(result?.rule).toEqual({ freq: "yearly", interval: 2 });
  });

  it("is case-insensitive", () => {
    const result = parseRecurrencePhrase("Take pills DAILY");
    expect(result?.rule).toEqual({ freq: "daily", interval: 1 });
  });

  it("tolerates surrounding whitespace", () => {
    const result = parseRecurrencePhrase("  every day  ");
    expect(result?.rule).toEqual({ freq: "daily", interval: 1 });
  });

  it("returns the correct match span for stripping", () => {
    const text = "take out trash every week";
    const result = parseRecurrencePhrase(text);
    expect(result).not.toBeNull();
    const { start, end } = result!.match;
    expect(text.slice(start, end)).toBe("every week");
  });

  describe("negative cases", () => {
    it("does not match 'everyday' as part of a longer word/phrase (everyday carry)", () => {
      const result = parseRecurrencePhrase("buy everyday carry gear");
      expect(result).toBeNull();
    });

    it("does not let a numeric count produce interval 3 or crash ('3 times every day')", () => {
      const result = parseRecurrencePhrase("take medicine 3 times every day");
      // Documented decision: "3 times" is not a recurrence-interval phrase (no
      // unit like days/weeks follows the number), so it must not be consumed
      // by the interval-N matcher. The literal "every day" phrase later in
      // the string still matches as plain daily (interval 1) — the count is
      // simply text the matcher doesn't understand and ignores.
      expect(result).not.toBeNull();
      expect(result?.rule).toEqual({ freq: "daily", interval: 1 });
    });

    it("returns null when there is no recurrence phrase at all", () => {
      const result = parseRecurrencePhrase("buy milk tomorrow");
      expect(result).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseRecurrencePhrase("")).toBeNull();
    });
  });
});
