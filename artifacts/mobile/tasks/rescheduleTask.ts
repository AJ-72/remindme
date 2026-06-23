/**
 * Boot-rescheduling task for Android.
 *
 * PRIMARY mechanism: expo-notifications' native NotificationsService is
 * a BroadcastReceiver that listens for BOOT_COMPLETED, REBOOT, and
 * QUICKBOOT_POWERON. On boot it calls setupScheduledNotifications() which
 * immediately re-arms every AlarmManager alarm from its persistent
 * SharedPreferences store — no JS required. This is what makes reminders
 * fire at the correct time even without the user reopening the app.
 *
 * SECONDARY mechanism (this file): a BackgroundFetch task that runs
 * periodically after the device has settled post-boot. It re-reads
 * AsyncStorage and reconciles notification IDs so that delete/edit/toggle
 * operations that run after a reboot cancel the right alarm. startOnBoot
 * causes expo-background-fetch to restore its periodic job on boot, so
 * the first reconciliation run happens within BackgroundFetch's minimum
 * interval (15 minutes on Android).
 *
 * Together these two mechanisms satisfy the acceptance criteria:
 * - Alarms fire at the correct time because expo-notifications re-arms
 *   them natively and immediately on boot.
 * - Notification IDs in AsyncStorage stay consistent thanks to this task.
 */
import { Platform } from "react-native";

import * as BackgroundFetch from "expo-background-fetch";
import * as TaskManager from "expo-task-manager";

import { rescheduleAllFutureReminders } from "@/services/ReminderService";

export const RESCHEDULE_TASK_NAME = "RESCHEDULE_REMINDERS_ON_BOOT";

// defineTask must run at module load (not inside a function) so it is
// available when expo-task-manager wakes the JS runtime headlessly.
// expo-task-manager ships a no-op web stub, so this is safe on all platforms.
if (Platform.OS !== "web") {
  TaskManager.defineTask(RESCHEDULE_TASK_NAME, async () => {
    try {
      await rescheduleAllFutureReminders();
      return BackgroundFetch.BackgroundFetchResult.NewData;
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  });
}

export async function registerRescheduleTask(): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const isRegistered =
      await TaskManager.isTaskRegisteredAsync(RESCHEDULE_TASK_NAME);
    if (!isRegistered) {
      await BackgroundFetch.registerTaskAsync(RESCHEDULE_TASK_NAME, {
        // 15 minutes is the Android minimum via JobScheduler.
        minimumInterval: 15 * 60,
        stopOnTerminate: false,
        startOnBoot: true,
      });
    }
  } catch {
    // Background fetch may not be available in all environments (e.g. web,
    // Expo Go with limited APIs).
  }
}
