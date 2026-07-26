import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  clearDebugLogs,
  formatDebugLogs,
  getDebugLogs,
  logDebug,
} from "@/services/DebugLogService";

beforeEach(async () => {
  await (AsyncStorage as any).clear();
  // AsyncStorage.clear() only clears the underlying storage — the service's
  // module-level in-memory cache survives it, so use the service's own
  // clear to reset both for test isolation.
  await clearDebugLogs();
});

describe("DebugLogService", () => {
  it("returns an empty list when nothing has been logged", async () => {
    expect(await getDebugLogs()).toEqual([]);
  });

  it("records a log entry with a timestamp and message", async () => {
    await logDebug("hello");
    const entries = await getDebugLogs();
    expect(entries).toHaveLength(1);
    expect(entries[0].message).toBe("hello");
    expect(typeof entries[0].timestamp).toBe("string");
  });

  it("persists entries across calls in append order", async () => {
    await logDebug("first");
    await logDebug("second");
    const entries = await getDebugLogs();
    expect(entries.map((e) => e.message)).toEqual(["first", "second"]);
  });

  it("does not lose entries when logDebug is called concurrently (no lost updates)", async () => {
    await Promise.all([logDebug("a"), logDebug("b"), logDebug("c"), logDebug("d")]);
    const entries = await getDebugLogs();
    expect(entries).toHaveLength(4);
    expect(new Set(entries.map((e) => e.message))).toEqual(new Set(["a", "b", "c", "d"]));
  });

  it("caps the log at 200 entries, dropping the oldest first", async () => {
    for (let i = 0; i < 205; i++) {
      await logDebug(`entry-${i}`);
    }
    const entries = await getDebugLogs();
    expect(entries).toHaveLength(200);
    expect(entries[0].message).toBe("entry-5");
    expect(entries[entries.length - 1].message).toBe("entry-204");
  });

  it("clearDebugLogs empties the log", async () => {
    await logDebug("something");
    await clearDebugLogs();
    expect(await getDebugLogs()).toEqual([]);
  });

  it("formatDebugLogs renders timestamp + message per entry", () => {
    const formatted = formatDebugLogs([
      { timestamp: "2026-07-26T10:00:00.000Z", message: "one" },
      { timestamp: "2026-07-26T10:00:01.000Z", message: "two" },
    ]);
    expect(formatted).toBe(
      "[2026-07-26T10:00:00.000Z] one\n\n[2026-07-26T10:00:01.000Z] two"
    );
  });
});
