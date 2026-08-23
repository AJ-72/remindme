import type { QuietHours } from "@/utils/quietHours";
import type { DictationLanguage, Reminder } from "@/services/ReminderService";
import type { SnoozePreset } from "@/utils/snoozePresets";

// Identifies our own export files. Checked on import so that picking an
// arbitrary .json from the share sheet fails loudly instead of silently
// importing nothing (a bare `reminders` array is not enough — plenty of
// unrelated files would match that).
export const BACKUP_FORMAT = "curiousmind.reminders.backup";
export const BACKUP_VERSION = 1;

export interface BackupSettings {
  defaultAlarmEnabled?: boolean;
  showDescriptionEnabled?: boolean;
  vibrationEnabled?: boolean;
  dictationLanguage?: DictationLanguage;
  snoozePreset?: SnoozePreset;
  quietHours?: QuietHours;
}

export interface ReminderBackup {
  format: string;
  version: number;
  exportedAt: string;
  reminders: Reminder[];
  settings: BackupSettings;
}

export type ParseResult =
  | { ok: true; backup: ReminderBackup; skipped: number }
  | { ok: false; reason: string };

export interface MergeResult {
  reminders: Reminder[];
  /** Incoming reminders that were genuinely new. */
  added: number;
  /** Reminders dropped because an equivalent one was already present. */
  duplicates: number;
}

// notificationId is deliberately stripped on export: it refers to a
// notification scheduled on the *exporting* device and means nothing on the
// importing one. Keeping it would let a stale id reach cancelNotification,
// which is harmless today only because cancelScheduledForReminder sweeps by
// payload — better not to depend on that.
function withoutNotificationId(reminder: Reminder): Reminder {
  const { notificationId: _drop, ...rest } = reminder;
  return rest;
}

export function serializeBackup(
  reminders: Reminder[],
  settings: BackupSettings
): string {
  const backup: ReminderBackup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    reminders: reminders.map(withoutNotificationId),
    settings,
  };
  return JSON.stringify(backup, null, 2);
}

function isValidReminder(value: unknown): value is Reminder {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Partial<Reminder>;
  if (typeof r.id !== "string" || !r.id) return false;
  if (typeof r.title !== "string") return false;
  if (typeof r.datetime !== "string") return false;
  // A reminder whose datetime can't be parsed can never be scheduled, and
  // would sit in the list forever as an un-fireable row.
  if (Number.isNaN(Date.parse(r.datetime))) return false;
  return true;
}

export function parseBackup(raw: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "not-json" };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, reason: "not-a-backup" };
  }

  const candidate = parsed as Partial<ReminderBackup>;
  if (candidate.format !== BACKUP_FORMAT) {
    return { ok: false, reason: "not-a-backup" };
  }
  // Refuse a file written by a newer app rather than importing a subset of it
  // and silently dropping fields this version doesn't know about.
  if (typeof candidate.version !== "number" || candidate.version > BACKUP_VERSION) {
    return { ok: false, reason: "unsupported-version" };
  }
  if (!Array.isArray(candidate.reminders)) {
    return { ok: false, reason: "not-a-backup" };
  }

  const reminders: Reminder[] = [];
  let skipped = 0;
  for (const entry of candidate.reminders) {
    if (!isValidReminder(entry)) {
      skipped += 1;
      continue;
    }
    reminders.push(
      withoutNotificationId({
        ...entry,
        description: typeof entry.description === "string" ? entry.description : "",
        completed: entry.completed === true,
      })
    );
  }

  const settings =
    typeof candidate.settings === "object" && candidate.settings !== null
      ? (candidate.settings as BackupSettings)
      : {};

  return {
    ok: true,
    skipped,
    backup: {
      format: BACKUP_FORMAT,
      version: candidate.version,
      exportedAt:
        typeof candidate.exportedAt === "string" ? candidate.exportedAt : new Date().toISOString(),
      reminders,
      settings,
    },
  };
}

// Two reminders are "the same" when they say the same thing at the same
// instant. Identity is CONTENT, never id, and both halves of that matter:
//
//  - id is not sufficient: the common restore path is export -> reinstall ->
//    re-type a few reminders from memory -> import, where the re-typed copy
//    has a fresh id but is the same reminder to the user.
//  - id is not even a valid shortcut. Returning true early on `a.id === b.id`
//    looks harmless but silently swallows the id-collision case, where two
//    genuinely different reminders share an id and one would be dropped as a
//    "duplicate". mergeReminders re-ids those instead.
//
// Title is compared case- and whitespace-insensitively; datetime by instant so
// two spellings of the same moment ("...:00Z" vs "...:00.000Z") match.
export function isSameReminder(a: Reminder, b: Reminder): boolean {
  const titleA = a.title.trim().toLowerCase();
  const titleB = b.title.trim().toLowerCase();
  if (titleA !== titleB) return false;
  return Date.parse(a.datetime) === Date.parse(b.datetime);
}

function findEquivalent(list: Reminder[], candidate: Reminder): Reminder | undefined {
  return list.find((existing) => isSameReminder(existing, candidate));
}

/**
 * Merge a backup's reminders into the ones already on this device.
 *
 * Local always wins on conflict: the copy on this phone reflects whatever the
 * user has done since the backup was taken (edits, marking done), and a
 * restore should never silently un-complete a reminder.
 */
export function mergeReminders(local: Reminder[], incoming: Reminder[]): MergeResult {
  const merged: Reminder[] = [];
  let duplicates = 0;

  // Local storage can itself hold duplicates (an earlier import, or the same
  // reminder typed twice), so it gets the same de-duplication pass.
  for (const reminder of local) {
    if (findEquivalent(merged, reminder)) {
      duplicates += 1;
      continue;
    }
    merged.push({ ...reminder });
  }

  let added = 0;
  for (const reminder of incoming) {
    const clean = withoutNotificationId(reminder);
    if (findEquivalent(merged, clean)) {
      duplicates += 1;
      continue;
    }
    // Same id but a genuinely different reminder: ids are
    // `Date.now() + random`, so this needs two devices to collide, but
    // importing it as-is would make one of the two unreachable by id.
    const idTaken = merged.some((existing) => existing.id === clean.id);
    merged.push(idTaken ? { ...clean, id: `${clean.id}-i${added}` } : { ...clean });
    added += 1;
  }

  merged.sort((a, b) => Date.parse(b.datetime) - Date.parse(a.datetime));
  return { reminders: merged, added, duplicates };
}
