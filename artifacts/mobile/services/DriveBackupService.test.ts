import { markBackupDirty } from "@/services/backupDirty";
import {
  createDriveBackupService,
  type DriveDeps,
  type GoogleAuthPort,
} from "@/services/DriveBackupService";
import { serializeBackup } from "@/utils/reminderBackup";
import type { Reminder } from "@/services/ReminderService";

// Everything Google-shaped is faked: an in-memory Drive appDataFolder behind
// a fetch that understands exactly the four calls the service makes, and a
// sign-in port that never touches the native module. No network, ever.

function reminder(title: string): Reminder {
  return { id: title, title, description: "", datetime: "2030-01-01T09:00:00.000Z", completed: false };
}

interface FakeFile {
  id: string;
  name: string;
  modifiedTime: string;
  body: string;
}

function fakeDrive() {
  const files: FakeFile[] = [];
  const calls: string[] = [];
  let failWith: number | null = null;
  let nextId = 1;

  const json = (status: number, body: unknown) =>
    ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }) as Response;
  const text = (status: number, body: string) =>
    ({ ok: true, status, json: async () => JSON.parse(body), text: async () => body }) as Response;

  const fetchImpl = jest.fn(async (url: string, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.split("?")[0]}`);
    if (failWith !== null) return json(failWith, { error: { message: "nope" } });
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (headers.Authorization !== "Bearer token-1") return json(401, {});

    if (method === "GET" && url.includes("/drive/v3/files?")) {
      const listed = [...files].sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime));
      return json(200, { files: listed.map(({ id, modifiedTime }) => ({ id, modifiedTime })) });
    }
    const idMatch = url.match(/\/files\/([^/?]+)/);
    if (method === "GET" && idMatch) {
      const f = files.find((x) => x.id === idMatch[1]);
      return f ? text(200, f.body) : json(404, {});
    }
    if (method === "POST" && url.includes("/upload/drive/v3/files")) {
      const body = String(init?.body);
      const content = body.split("\r\n\r\n").pop()!.split("\r\n--")[0];
      const f = { id: `f${nextId++}`, name: "reminders-backup.json", modifiedTime: new Date().toISOString(), body: content };
      files.push(f);
      return json(200, { id: f.id });
    }
    if (method === "PATCH" && idMatch) {
      const f = files.find((x) => x.id === idMatch[1])!;
      f.body = String(init?.body);
      f.modifiedTime = new Date().toISOString();
      return json(200, { id: f.id });
    }
    return json(400, {});
  });

  return {
    files,
    calls,
    fetch: fetchImpl,
    failNextWith: (status: number | null) => {
      failWith = status;
    },
  };
}

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: jest.fn(async (k: string) => map.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      map.set(k, v);
    }),
    removeItem: jest.fn(async (k: string) => {
      map.delete(k);
    }),
  };
}

function setup(over: { signedIn?: boolean; local?: Reminder[]; configured?: boolean } = {}) {
  const drive = fakeDrive();
  const storage = memoryStorage();
  let local = over.local ?? [reminder("Pay land tax")];
  let signedIn = over.signedIn ?? true;
  const auth: GoogleAuthPort = {
    signIn: jest.fn(async () => {
      signedIn = true;
      return { email: "me@example.com" };
    }),
    getAccessToken: jest.fn(async () => {
      if (!signedIn) throw new Error("not signed in");
      return "token-1";
    }),
    signOut: jest.fn(async () => {
      signedIn = false;
    }),
  };
  const importBackupJson = jest.fn(async () => ({ ok: true as const, added: 1, duplicates: 0, skipped: 0 }));
  const deps: DriveDeps = {
    configured: over.configured ?? true,
    auth,
    fetch: drive.fetch as unknown as DriveDeps["fetch"],
    storage,
    buildBackupJson: async () => serializeBackup(local, {}, { userName: "Anand" }),
    importBackupJson,
    now: () => new Date("2026-09-25T12:00:00.000Z"),
  };
  const service = createDriveBackupService(deps);
  return {
    service,
    drive,
    storage,
    auth,
    importBackupJson,
    setLocal: (r: Reminder[]) => {
      local = r;
    },
  };
}

async function signedInAndSettled(over: Parameters<typeof setup>[0] = {}) {
  const ctx = setup(over);
  await ctx.service.signIn();
  await ctx.service.markRestoreSettled();
  return ctx;
}

describe("DriveBackupService — not configured", () => {
  it("no-ops every call without touching the network", async () => {
    const { service, drive } = setup({ configured: false });
    expect(service.isConfigured()).toBe(false);
    expect(await service.signIn()).toEqual({ ok: false, error: "not_configured" });
    expect(await service.findBackup()).toEqual({ ok: false, error: "not_configured" });
    expect(await service.uploadBackup("manual")).toEqual({ ok: false, error: "not_configured" });
    expect(drive.fetch).not.toHaveBeenCalled();
  });
});

describe("DriveBackupService — upload", () => {
  it("creates the backup file the first time, then updates the same file", async () => {
    const { service, drive, setLocal } = await signedInAndSettled();

    expect(await service.uploadBackup("manual")).toMatchObject({ ok: true, uploaded: true });
    setLocal([reminder("Pay land tax"), reminder("Renew passport")]);
    expect(await service.uploadBackup("manual")).toMatchObject({ ok: true, uploaded: true });

    expect(drive.files).toHaveLength(1);
    expect(JSON.parse(drive.files[0].body).reminders).toHaveLength(2);
  });

  it("records when it last backed up", async () => {
    const { service } = await signedInAndSettled();
    await service.uploadBackup("manual");
    expect(await service.getStatus()).toMatchObject({
      email: "me@example.com",
      lastBackupAt: "2026-09-25T12:00:00.000Z",
      lastError: null,
    });
  });

  // Invariant 3: upload only when the content changed.
  it("skips an automatic upload when nothing changed", async () => {
    const { service, drive } = await signedInAndSettled();
    await service.uploadBackup("auto");
    drive.fetch.mockClear();

    expect(await service.uploadBackup("auto")).toEqual({ ok: true, uploaded: false, skipped: "unchanged" });
    expect(drive.fetch).not.toHaveBeenCalled();
  });

  it("does nothing automatically while signed out", async () => {
    const { service, drive } = setup({ signedIn: false });
    expect(await service.uploadBackup("auto")).toEqual({ ok: true, uploaded: false, skipped: "signed_out" });
    expect(drive.fetch).not.toHaveBeenCalled();
  });

  // Invariant 1: a fresh install that has signed in but not yet decided
  // about restore must never upload - its empty state would replace the one
  // copy the user is about to restore from.
  it("never auto-uploads before this install has settled its restore decision", async () => {
    const { service, drive } = setup();
    await service.signIn();

    expect(await service.uploadBackup("auto")).toEqual({ ok: true, uploaded: false, skipped: "not_settled" });
    expect(await service.uploadBackup("background")).toEqual({ ok: true, uploaded: false, skipped: "not_settled" });
    expect(drive.files).toHaveLength(0);
  });

  // Invariant 2: an empty install never silently replaces a backup that has
  // reminders in it, even once settled.
  it("refuses to replace a backup that has reminders with an empty one", async () => {
    const { service, drive, setLocal } = await signedInAndSettled();
    await service.uploadBackup("manual");
    setLocal([]);

    expect(await service.uploadBackup("auto")).toEqual({ ok: true, uploaded: false, skipped: "guard" });
    expect(await service.uploadBackup("manual")).toEqual({ ok: true, uploaded: false, skipped: "guard" });
    expect(JSON.parse(drive.files[0].body).reminders).toHaveLength(1);
  });

  it("replaces it with an empty backup only when the user explicitly confirms", async () => {
    const { service, drive, setLocal } = await signedInAndSettled();
    await service.uploadBackup("manual");
    setLocal([]);

    expect(await service.uploadBackup("manual", { allowReplaceWithEmpty: true })).toMatchObject({ uploaded: true });
    expect(JSON.parse(drive.files[0].body).reminders).toHaveLength(0);
  });

  it("maps an expired sign-in to an auth error and records it", async () => {
    const { service, drive } = await signedInAndSettled();
    drive.failNextWith(401);

    expect(await service.uploadBackup("manual")).toEqual({ ok: false, error: "auth" });
    expect((await service.getStatus())?.lastError).toBe("auth");
  });

  it("maps a full Drive to a quota error", async () => {
    const { service, drive } = await signedInAndSettled();
    drive.fetch.mockImplementationOnce(async () =>
      ({ ok: false, status: 403, text: async () => '{"error":{"errors":[{"reason":"storageQuotaExceeded"}]}}' }) as Response
    );
    expect(await service.uploadBackup("manual")).toEqual({ ok: false, error: "quota" });
  });

  it("maps a thrown fetch to a network error rather than throwing", async () => {
    const { service, drive } = await signedInAndSettled();
    drive.fetch.mockRejectedValueOnce(new TypeError("Network request failed"));
    expect(await service.uploadBackup("manual")).toEqual({ ok: false, error: "network" });
  });
});

describe("DriveBackupService — find and restore", () => {
  it("reports no backup for an account that has none", async () => {
    const { service } = setup();
    await service.signIn();
    expect(await service.findBackup()).toEqual({ ok: true, backup: null });
  });

  it("finds the backup another install wrote, with its counts and identity", async () => {
    const other = await signedInAndSettled({ local: [reminder("A"), reminder("B")] });
    await other.service.uploadBackup("manual");

    // A fresh install on the same account, sharing the same Drive.
    const fresh = setup({ local: [] });
    fresh.drive.files.push(...other.drive.files);
    await fresh.service.signIn();

    const found = await fresh.service.findBackup();
    if (!found.ok || !found.backup) throw new Error("expected a backup");
    expect(found.backup.reminderCount).toBe(2);
    expect(found.backup.identity).toEqual({ userName: "Anand" });
  });

  it("restores through the ordinary import path and settles this install", async () => {
    const { service, importBackupJson } = setup();
    await service.signIn();

    const result = await service.restoreFromBackup('{"raw":"file"}');

    expect(importBackupJson).toHaveBeenCalledWith('{"raw":"file"}');
    expect(result).toMatchObject({ ok: true, added: 1 });
    expect(await service.isRestoreSettled()).toBe(true);
  });
});

describe("DriveBackupService — sign out", () => {
  it("forgets the account and the last-backup state but leaves the Drive file", async () => {
    const { service, drive } = await signedInAndSettled();
    await service.uploadBackup("manual");

    await service.signOut();

    expect(await service.getStatus()).toBeNull();
    expect(drive.files).toHaveLength(1);
  });
});

describe("DriveBackupService — auto-backup", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("uploads once, debounced, after a burst of changes", async () => {
    const { service, drive } = await signedInAndSettled();
    const stop = service.startAutoBackup({ debounceMs: 30_000 });

    markBackupDirty();
    markBackupDirty();
    markBackupDirty();
    await jest.advanceTimersByTimeAsync(29_000);
    expect(drive.files).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(2_000);

    expect(drive.calls.filter((c) => c.startsWith("POST"))).toHaveLength(1);
    stop();
  });

  it("flushes a pending change immediately when asked (app going to background)", async () => {
    const { service, drive } = await signedInAndSettled();
    const stop = service.startAutoBackup({ debounceMs: 30_000 });

    markBackupDirty();
    await service.flushPendingBackup();

    expect(drive.files).toHaveLength(1);
    stop();
  });

  it("stops listening once stopped", async () => {
    const { service, drive } = await signedInAndSettled();
    service.startAutoBackup({ debounceMs: 1_000 })();

    markBackupDirty();
    await jest.advanceTimersByTimeAsync(5_000);

    expect(drive.fetch).not.toHaveBeenCalled();
  });
});
