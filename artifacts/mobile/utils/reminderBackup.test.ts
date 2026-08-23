import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  isSameReminder,
  mergeReminders,
  parseBackup,
  serializeBackup,
  type ReminderBackup,
} from "@/utils/reminderBackup";
import type { Reminder } from "@/services/ReminderService";

function reminder(over: Partial<Reminder> = {}): Reminder {
  return {
    id: "1",
    title: "Call Amma",
    description: "",
    datetime: "2026-09-01T10:00:00.000Z",
    completed: false,
    ...over,
  };
}

describe("serializeBackup", () => {
  it("wraps reminders in an envelope carrying format and version", () => {
    const json = serializeBackup([reminder()], {});
    const parsed = JSON.parse(json);

    expect(parsed.format).toBe(BACKUP_FORMAT);
    expect(parsed.version).toBe(BACKUP_VERSION);
    expect(parsed.reminders).toHaveLength(1);
  });

  it("records an exportedAt timestamp", () => {
    const json = serializeBackup([reminder()], {});
    expect(typeof JSON.parse(json).exportedAt).toBe("string");
    expect(Number.isNaN(Date.parse(JSON.parse(json).exportedAt))).toBe(false);
  });

  it("carries settings through", () => {
    const json = serializeBackup([], { defaultAlarmEnabled: false, dictationLanguage: "ml-IN" });
    expect(JSON.parse(json).settings).toEqual({
      defaultAlarmEnabled: false,
      dictationLanguage: "ml-IN",
    });
  });

  it("drops notificationId — it belongs to the device that scheduled it", () => {
    const json = serializeBackup([reminder({ notificationId: "local-abc" })], {});
    expect(JSON.parse(json).reminders[0]).not.toHaveProperty("notificationId");
  });
});

describe("parseBackup", () => {
  it("round-trips what serializeBackup produced", () => {
    const source = [reminder({ id: "a" }), reminder({ id: "b", title: "Pay land tax" })];
    const result = parseBackup(serializeBackup(source, { defaultAlarmEnabled: true }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.reminders).toHaveLength(2);
    expect(result.backup.settings.defaultAlarmEnabled).toBe(true);
  });

  it("rejects text that is not JSON", () => {
    expect(parseBackup("not json{").ok).toBe(false);
  });

  it("rejects JSON that is not a backup envelope", () => {
    expect(parseBackup(JSON.stringify({ hello: "world" })).ok).toBe(false);
  });

  it("rejects a foreign file that happens to have a reminders array", () => {
    expect(parseBackup(JSON.stringify({ reminders: [] })).ok).toBe(false);
  });

  it("rejects a newer format version rather than guessing at it", () => {
    const json = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION + 1,
      exportedAt: new Date().toISOString(),
      reminders: [],
      settings: {},
    });
    expect(parseBackup(json).ok).toBe(false);
  });

  it("skips entries missing required fields instead of importing corrupt reminders", () => {
    const json = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      reminders: [reminder({ id: "good" }), { id: "bad", title: "no datetime" }],
      settings: {},
    });

    const result = parseBackup(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.reminders).toHaveLength(1);
    expect(result.backup.reminders[0].id).toBe("good");
    expect(result.skipped).toBe(1);
  });

  it("rejects an entry whose datetime is not a real date", () => {
    const json = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      reminders: [reminder({ datetime: "someday" })],
      settings: {},
    });

    const result = parseBackup(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.reminders).toHaveLength(0);
    expect(result.skipped).toBe(1);
  });

  it("defaults a missing completed flag rather than skipping the reminder", () => {
    const json = JSON.stringify({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      reminders: [{ id: "x", title: "t", description: "", datetime: "2026-09-01T10:00:00.000Z" }],
      settings: {},
    });

    const result = parseBackup(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.reminders[0].completed).toBe(false);
  });
});

describe("isSameReminder", () => {
  it("treats identical title and datetime as the same reminder even with different ids", () => {
    expect(
      isSameReminder(reminder({ id: "a" }), reminder({ id: "b" }))
    ).toBe(true);
  });

  it("ignores surrounding whitespace and case in the title", () => {
    expect(
      isSameReminder(reminder({ id: "a", title: "Call Amma" }), reminder({ id: "b", title: "  call amma  " }))
    ).toBe(true);
  });

  it("treats the same title at a different time as different reminders", () => {
    expect(
      isSameReminder(
        reminder({ id: "a" }),
        reminder({ id: "b", datetime: "2026-09-02T10:00:00.000Z" })
      )
    ).toBe(false);
  });

  it("compares datetime by instant, not by string form", () => {
    expect(
      isSameReminder(
        reminder({ id: "a", datetime: "2026-09-01T10:00:00.000Z" }),
        reminder({ id: "b", datetime: "2026-09-01T10:00:00Z" })
      )
    ).toBe(true);
  });

  it("treats different titles at the same time as different reminders", () => {
    expect(
      isSameReminder(reminder({ id: "a" }), reminder({ id: "b", title: "Pay tax" }))
    ).toBe(false);
  });
});

describe("mergeReminders", () => {
  it("keeps existing reminders that the backup does not contain", () => {
    const result = mergeReminders([reminder({ id: "local" })], []);
    expect(result.reminders).toHaveLength(1);
    expect(result.added).toBe(0);
  });

  it("adds incoming reminders that do not exist locally", () => {
    const result = mergeReminders(
      [reminder({ id: "local", title: "Local one" })],
      [reminder({ id: "incoming", title: "Incoming one" })]
    );

    expect(result.reminders).toHaveLength(2);
    expect(result.added).toBe(1);
  });

  it("does not duplicate a reminder present in both, matched by id", () => {
    const result = mergeReminders([reminder({ id: "same" })], [reminder({ id: "same" })]);

    expect(result.reminders).toHaveLength(1);
    expect(result.added).toBe(0);
    expect(result.duplicates).toBe(1);
  });

  it("does not duplicate the same reminder re-created by hand with a different id", () => {
    const result = mergeReminders(
      [reminder({ id: "typed-again" })],
      [reminder({ id: "from-backup" })]
    );

    expect(result.reminders).toHaveLength(1);
    expect(result.added).toBe(0);
    expect(result.duplicates).toBe(1);
  });

  it("keeps the local copy when a reminder exists on both sides", () => {
    const result = mergeReminders(
      [reminder({ id: "same", description: "local notes" })],
      [reminder({ id: "same", description: "backup notes" })]
    );

    expect(result.reminders[0].description).toBe("local notes");
  });

  it("keeps a local reminder's completed state over the backup's", () => {
    const result = mergeReminders(
      [reminder({ id: "same", completed: true })],
      [reminder({ id: "same", completed: false })]
    );

    expect(result.reminders[0].completed).toBe(true);
  });

  it("de-duplicates within the incoming backup itself", () => {
    const result = mergeReminders(
      [],
      [reminder({ id: "a" }), reminder({ id: "b" })]
    );

    expect(result.reminders).toHaveLength(1);
    expect(result.added).toBe(1);
    expect(result.duplicates).toBe(1);
  });

  it("de-duplicates reminders already duplicated in local storage", () => {
    const result = mergeReminders([reminder({ id: "a" }), reminder({ id: "b" })], []);

    expect(result.reminders).toHaveLength(1);
    expect(result.duplicates).toBe(1);
  });

  it("never carries a notificationId in from the backup", () => {
    const result = mergeReminders([], [{ ...reminder({ id: "x" }), notificationId: "stale" }]);
    expect(result.reminders[0].notificationId).toBeUndefined();
  });

  it("re-ids an incoming reminder that collides with a different local reminder", () => {
    const result = mergeReminders(
      [reminder({ id: "clash", title: "Local thing" })],
      [reminder({ id: "clash", title: "Different thing" })]
    );

    expect(result.reminders).toHaveLength(2);
    const ids = result.reminders.map((r) => r.id);
    expect(new Set(ids).size).toBe(2);
  });

  it("sorts the merged list newest datetime first", () => {
    const result = mergeReminders(
      [reminder({ id: "old", title: "Old", datetime: "2026-09-01T10:00:00.000Z" })],
      [reminder({ id: "new", title: "New", datetime: "2026-12-01T10:00:00.000Z" })]
    );

    expect(result.reminders[0].id).toBe("new");
  });

  it("leaves the inputs untouched", () => {
    const local = [reminder({ id: "a" })];
    const incoming = [reminder({ id: "b", title: "Other" })];
    mergeReminders(local, incoming);

    expect(local).toHaveLength(1);
    expect(incoming).toHaveLength(1);
  });
});


// BackupSettings is an explicit allow-list, not a spread - a new setting
// silently vanishes from every backup unless it is added there.
describe("quiet hours in a backup", () => {
  it("carries quiet hours through a round-trip", () => {
    const json = serializeBackup([], {
      quietHours: { startMinute: 1320, endMinute: 480 },
    });
    const result = parseBackup(json);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.backup.settings.quietHours).toEqual({
      startMinute: 1320,
      endMinute: 480,
    });
  });
});
