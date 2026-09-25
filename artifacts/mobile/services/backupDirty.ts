/**
 * "Something a backup would contain just changed" - the one signal
 * ReminderService emits for Drive auto-backup (B3).
 *
 * Its own module purely to break an import cycle, the same reason
 * telemetryConsent.ts exists: DriveBackupService imports ReminderService (to
 * build the backup), so ReminderService cannot import DriveBackupService back.
 * Emitting here is synchronous and never throws, so a write path can call it
 * unconditionally.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

export function markBackupDirty(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A failing listener must never break the write that triggered it.
    }
  }
}

export function onBackupDirty(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
