import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";

import { EVENTS } from "@/constants/analytics";
import {
  DRIVE_APPDATA_SCOPE,
  DRIVE_BACKUP_FILENAME,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
} from "@/constants/googleDrive";
import { track } from "@/services/AnalyticsService";
import { logDebug } from "@/services/DebugLogService";
import { onBackupDirty } from "@/services/backupDirty";
import type { ImportResult } from "@/services/ReminderService";
import { backupContentHash, parseBackup, type BackupIdentity } from "@/utils/reminderBackup";

/**
 * Google Drive backup (B3). The only module that knows Google exists -
 * screens call this, never the sign-in library or the Drive API.
 *
 * One file, `reminders-backup.json`, in the hidden per-app `appDataFolder`
 * (scope drive.appdata: non-sensitive, invisible in the user's Drive UI,
 * readable only by this OAuth project on any platform). The file is the same
 * JSON the manual export writes, so a Drive restore and a file import share
 * one parser and one merge (`importRemindersFromJson`).
 *
 * Invariants, each pinned by a test (spec:
 * docs/superpowers/specs/2026-09-25-google-drive-backup-design.md):
 *  1. No automatic upload before this install has settled its restore
 *     decision - a fresh install that signs in would otherwise back up its
 *     empty state over the one copy it is about to restore from.
 *  2. Never replace a backup that has reminders with one that has none,
 *     unless the user explicitly confirms.
 *  3. Upload only when the content changed (hash ignores exportedAt).
 *  4. No call throws out of this module; errors are a closed union.
 *  5. Telemetry carries counts and error codes only - never the email or
 *     the number.
 */

export type DriveError = "not_configured" | "cancelled" | "network" | "auth" | "quota" | "unknown";
export type UploadTrigger = "auto" | "background" | "manual" | "restore";
export type SkipReason = "unchanged" | "guard" | "not_settled" | "signed_out";

export type UploadResult =
  | { ok: true; uploaded: true; uploadedAt: string }
  | { ok: true; uploaded: false; skipped: SkipReason }
  | { ok: false; error: DriveError };

export interface RemoteBackup {
  raw: string;
  modifiedTime: string;
  reminderCount: number;
  identity: BackupIdentity;
}

export interface DriveStatus {
  email: string;
  lastBackupAt: string | null;
  lastError: DriveError | null;
}

/** The slice of Google sign-in this module needs; faked in tests. */
export interface GoogleAuthPort {
  /** Interactive. Resolves "cancelled" if the user backs out. */
  signIn(): Promise<{ email: string } | "cancelled">;
  /** Silent; refreshes as needed. Throws when there is no usable sign-in. */
  getAccessToken(): Promise<string>;
  signOut(): Promise<void>;
}

export interface DriveDeps {
  configured: boolean;
  auth: GoogleAuthPort;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  storage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
  };
  buildBackupJson: () => Promise<string>;
  importBackupJson: (raw: string) => Promise<ImportResult>;
  now: () => Date;
}

const KEYS = {
  account: "@drive_account_v1",
  settled: "@drive_restore_settled_v1",
  lastHash: "@drive_last_hash_v1",
  lastBackupAt: "@drive_last_backup_at_v1",
  lastError: "@drive_last_error_v1",
};

const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

class DriveHttpError extends Error {
  constructor(public readonly code: DriveError) {
    super(code);
  }
}

function classify(e: unknown): DriveError {
  if (e instanceof DriveHttpError) return e.code;
  if (e instanceof TypeError) return "network";
  return "unknown";
}

function countReminders(raw: string): number {
  const parsed = parseBackup(raw);
  return parsed.ok ? parsed.backup.reminders.length : 0;
}

export function createDriveBackupService(deps: DriveDeps) {
  const { storage } = deps;

  async function token(): Promise<string> {
    try {
      return await deps.auth.getAccessToken();
    } catch {
      throw new DriveHttpError("auth");
    }
  }

  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    const accessToken = await token();
    const res = await deps.fetch(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${accessToken}` },
    });
    if (res.ok) return res;
    if (res.status === 401) throw new DriveHttpError("auth");
    if (res.status === 403) {
      const body = await res.text().catch(() => "");
      throw new DriveHttpError(body.includes("storageQuotaExceeded") ? "quota" : "auth");
    }
    throw new DriveHttpError("unknown");
  }

  async function findFile(): Promise<{ id: string; modifiedTime: string } | null> {
    const q = encodeURIComponent(`name='${DRIVE_BACKUP_FILENAME}' and trashed=false`);
    const res = await request(
      `${API}?spaces=appDataFolder&q=${q}&orderBy=modifiedTime%20desc&fields=files(id,modifiedTime)`
    );
    const body = (await res.json()) as { files?: { id: string; modifiedTime: string }[] };
    return body.files?.[0] ?? null;
  }

  async function download(id: string): Promise<string> {
    const res = await request(`${API}/${id}?alt=media`);
    return res.text();
  }

  async function writeFile(existingId: string | null, json: string): Promise<void> {
    if (existingId) {
      await request(`${UPLOAD}/${existingId}?uploadType=media`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: json,
      });
      return;
    }
    const boundary = "remindme-backup-boundary";
    const metadata = JSON.stringify({ name: DRIVE_BACKUP_FILENAME, parents: ["appDataFolder"] });
    const body =
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${boundary}--`;
    await request(`${UPLOAD}?uploadType=multipart`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    });
  }

  async function isRestoreSettled(): Promise<boolean> {
    return (await storage.getItem(KEYS.settled)) === "1";
  }

  async function markRestoreSettled(): Promise<void> {
    await storage.setItem(KEYS.settled, "1");
  }

  async function signIn(): Promise<{ ok: true; email: string } | { ok: false; error: DriveError }> {
    if (!deps.configured) return { ok: false, error: "not_configured" };
    let result: { email: string } | "cancelled";
    try {
      result = await deps.auth.signIn();
    } catch (e) {
      const error = classify(e);
      track(EVENTS.DRIVE_SIGNIN_RESULT, { ok: false, error });
      return { ok: false, error };
    }
    if (result === "cancelled") {
      track(EVENTS.DRIVE_SIGNIN_RESULT, { ok: false, error: "cancelled" });
      return { ok: false, error: "cancelled" };
    }
    await storage.setItem(KEYS.account, result.email);
    track(EVENTS.DRIVE_SIGNIN_RESULT, { ok: true, error: null });
    return { ok: true, email: result.email };
  }

  async function signOut(): Promise<void> {
    try {
      await deps.auth.signOut();
    } catch {
      // Local state is cleared regardless - the user asked to stop.
    }
    await Promise.all(
      [KEYS.account, KEYS.lastHash, KEYS.lastBackupAt, KEYS.lastError].map((k) => storage.removeItem(k))
    );
  }

  async function getStatus(): Promise<DriveStatus | null> {
    const email = await storage.getItem(KEYS.account);
    if (!email) return null;
    const [lastBackupAt, lastError] = await Promise.all([
      storage.getItem(KEYS.lastBackupAt),
      storage.getItem(KEYS.lastError),
    ]);
    return { email, lastBackupAt, lastError: (lastError as DriveError | null) ?? null };
  }

  async function findBackup(): Promise<{ ok: true; backup: RemoteBackup | null } | { ok: false; error: DriveError }> {
    if (!deps.configured) return { ok: false, error: "not_configured" };
    try {
      const file = await findFile();
      if (!file) return { ok: true, backup: null };
      const raw = await download(file.id);
      const parsed = parseBackup(raw);
      return {
        ok: true,
        backup: {
          raw,
          modifiedTime: file.modifiedTime,
          reminderCount: parsed.ok ? parsed.backup.reminders.length : 0,
          identity: parsed.ok ? parsed.backup.identity : {},
        },
      };
    } catch (e) {
      return { ok: false, error: classify(e) };
    }
  }

  async function restoreFromBackup(raw: string): Promise<ImportResult> {
    const result = await deps.importBackupJson(raw);
    if (result.ok) await markRestoreSettled();
    return result;
  }

  async function uploadBackup(
    trigger: UploadTrigger,
    options: { allowReplaceWithEmpty?: boolean } = {}
  ): Promise<UploadResult> {
    if (!deps.configured) return { ok: false, error: "not_configured" };
    const result = await uploadInner(trigger, options);
    // Traced to the on-device debug log (Settings -> Backup -> Debug logs):
    // backgrounding and Android's app freezer decide whether an upload ever
    // lands, and that is invisible from the UI (B3 device run, 2026-09-25).
    void logDebug(
      `drive upload ${trigger}: ${result.ok ? (result.uploaded ? "uploaded" : `skipped ${result.skipped}`) : `error ${result.error}`}`
    );
    if (result.ok) {
      track(EVENTS.DRIVE_BACKUP_RESULT, {
        ok: true,
        trigger,
        error: null,
        skipped: result.uploaded ? null : result.skipped,
      });
    } else {
      await storage.setItem(KEYS.lastError, result.error);
      track(EVENTS.DRIVE_BACKUP_RESULT, { ok: false, trigger, error: result.error, skipped: null });
    }
    return result;
  }

  async function uploadInner(
    trigger: UploadTrigger,
    options: { allowReplaceWithEmpty?: boolean }
  ): Promise<UploadResult> {
    const automatic = trigger === "auto" || trigger === "background";
    if (automatic && !(await storage.getItem(KEYS.account))) {
      return { ok: true, uploaded: false, skipped: "signed_out" };
    }
    if (automatic && !(await isRestoreSettled())) {
      return { ok: true, uploaded: false, skipped: "not_settled" };
    }

    const json = await deps.buildBackupJson();
    const hash = backupContentHash(json);
    if (automatic && hash === (await storage.getItem(KEYS.lastHash))) {
      return { ok: true, uploaded: false, skipped: "unchanged" };
    }

    try {
      const existing = await findFile();
      if (existing && countReminders(json) === 0 && !options.allowReplaceWithEmpty) {
        if (countReminders(await download(existing.id)) > 0) {
          return { ok: true, uploaded: false, skipped: "guard" };
        }
      }
      await writeFile(existing?.id ?? null, json);
    } catch (e) {
      return { ok: false, error: classify(e) };
    }

    // A manual or restore-time upload is itself the restore decision.
    if (!automatic) await markRestoreSettled();
    const uploadedAt = deps.now().toISOString();
    await storage.setItem(KEYS.lastHash, hash);
    await storage.setItem(KEYS.lastBackupAt, uploadedAt);
    await storage.removeItem(KEYS.lastError);
    return { ok: true, uploaded: true, uploadedAt };
  }

  let pending: ReturnType<typeof setTimeout> | null = null;

  async function flushPendingBackup(): Promise<void> {
    void logDebug(`drive flush: ${pending ? "pending change, uploading" : "nothing pending"}`);
    if (!pending) return;
    clearTimeout(pending);
    pending = null;
    await uploadBackup("auto");
  }

  /**
   * Debounced upload after any change. Returns a stop function.
   *
   * 5 s, not longer: on a real device (2026-09-25) an edit followed by Home
   * never reached Drive until the app came back - Android freezes a
   * backgrounded app within seconds, so a long debounce mostly waits out the
   * window in which an upload can still finish. Cheap either way: unchanged
   * content is skipped by hash without any network.
   */
  function startAutoBackup({ debounceMs = 5_000 }: { debounceMs?: number } = {}): () => void {
    const unsubscribe = onBackupDirty(() => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        pending = null;
        void uploadBackup("auto");
      }, debounceMs);
    });
    return () => {
      unsubscribe();
      if (pending) clearTimeout(pending);
      pending = null;
    };
  }

  return {
    isConfigured: () => deps.configured,
    signIn,
    signOut,
    getStatus,
    findBackup,
    restoreFromBackup,
    uploadBackup,
    isRestoreSettled,
    markRestoreSettled,
    startAutoBackup,
    flushPendingBackup,
  };
}

export type DriveBackupService = ReturnType<typeof createDriveBackupService>;

// --- Production wiring ------------------------------------------------------

type GoogleSigninModule = typeof import("@react-native-google-signin/google-signin");

let googleModule: GoogleSigninModule | null | undefined;
let configured = false;

// Loaded lazily and guarded, the same way expo-notifications is: a build
// without the native module (Expo Go, web, Jest) must degrade to "Drive
// backup unavailable", never crash at import.
function loadGoogle(): GoogleSigninModule | null {
  if (googleModule !== undefined) return googleModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    googleModule = require("@react-native-google-signin/google-signin") as GoogleSigninModule;
  } catch {
    googleModule = null;
  }
  return googleModule;
}

function google(): GoogleSigninModule {
  const mod = loadGoogle();
  if (!mod) throw new Error("google sign-in unavailable");
  if (!configured) {
    mod.GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      iosClientId: GOOGLE_IOS_CLIENT_ID || undefined,
      scopes: [DRIVE_APPDATA_SCOPE],
    });
    configured = true;
  }
  return mod;
}

const googleAuth: GoogleAuthPort = {
  async signIn() {
    const { GoogleSignin, isErrorWithCode, statusCodes } = google();
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const res = await GoogleSignin.signIn();
      if (res.type !== "success") return "cancelled";
      return { email: res.data.user.email };
    } catch (e) {
      if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) return "cancelled";
      throw e;
    }
  },
  async getAccessToken() {
    const { GoogleSignin } = google();
    if (!GoogleSignin.getCurrentUser()) {
      const res = await GoogleSignin.signInSilently();
      if (res.type !== "success") throw new Error("no saved sign-in");
    }
    return (await GoogleSignin.getTokens()).accessToken;
  },
  async signOut() {
    await google().GoogleSignin.signOut();
  },
};

let instance: DriveBackupService | null = null;

/** The app-wide instance. Lazily built so importing this file costs nothing. */
export function getDriveBackup(): DriveBackupService {
  if (!instance) {
    // Required lazily: ReminderService imports backupDirty, and a top-level
    // import of ReminderService here would make every importer of this file
    // load the whole service graph.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const reminders = require("@/services/ReminderService") as typeof import("@/services/ReminderService");
    instance = createDriveBackupService({
      // Off under Jest like telemetry: tests use createDriveBackupService
      // with fakes, and a suite must never reach a real sign-in module.
      configured:
        !process.env.JEST_WORKER_ID &&
        Platform.OS !== "web" &&
        !!GOOGLE_WEB_CLIENT_ID &&
        loadGoogle() !== null,
      auth: googleAuth,
      fetch: (url, init) => fetch(url, init),
      storage: AsyncStorage,
      buildBackupJson: reminders.buildBackupJson,
      importBackupJson: reminders.importRemindersFromJson,
      now: () => new Date(),
    });
  }
  return instance;
}

/**
 * Wires auto-backup for the app's lifetime: debounced upload after changes,
 * plus an immediate flush when the app leaves the foreground (the debounce
 * timer would otherwise die with a backgrounded JS thread). Returns a stop
 * function for the root layout's effect cleanup.
 */
export function startAppAutoBackup(): () => void {
  const drive = getDriveBackup();
  if (!drive.isConfigured()) return () => {};
  const stop = drive.startAutoBackup();
  const sub = AppState.addEventListener("change", (state) => {
    if (state === "background") void drive.flushPendingBackup();
  });
  return () => {
    stop();
    sub.remove();
  };
}
