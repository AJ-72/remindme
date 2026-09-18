import { useEffect } from "react";
import { AppState } from "react-native";
import { useSyncExternalStore } from "react";

import {
  getNotificationPermissionState,
  type NotificationPermissionState,
} from "@/services/ReminderService";

/**
 * One shared snapshot of the notification permission, read by every card and
 * banner that needs it.
 *
 * A per-component useState would mean N permission reads for a list of N
 * reminders, and N copies of the same value drifting apart after the user
 * returns from system settings. A module-level store keeps it to one read and
 * one truth, and useSyncExternalStore re-renders even memoised cards when it
 * changes.
 */
let snapshot: NotificationPermissionState = { granted: true, canAskAgain: true };
let loaded = false;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): NotificationPermissionState {
  return snapshot;
}

/**
 * Re-read the OS state. Exported because a screen that just sent the user to
 * system settings has to refresh without waiting for a foreground event it
 * may already have missed.
 */
export async function refreshNotificationPermission(): Promise<NotificationPermissionState> {
  const next = await getNotificationPermissionState();
  loaded = true;
  if (next.granted !== snapshot.granted || next.canAskAgain !== snapshot.canAskAgain) {
    snapshot = next;
    emit();
  }
  return next;
}

/** Test-only: drop the cached snapshot so each test starts from a clean read. */
export function resetNotificationPermissionCache(): void {
  snapshot = { granted: true, canAskAgain: true };
  loaded = false;
}

export function useNotificationPermission(): NotificationPermissionState {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    // The initial default is "granted" on purpose: until the first read
    // lands, claiming reminders will not ring would flash a false warning on
    // every launch of a perfectly working install.
    if (!loaded) void refreshNotificationPermission();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") void refreshNotificationPermission();
    });
    return () => sub.remove();
  }, []);

  return state;
}
