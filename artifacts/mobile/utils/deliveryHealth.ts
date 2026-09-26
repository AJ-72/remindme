/**
 * B26 delivery self-check: turns raw device readings into the four conditions
 * that silently discard reminders on Android. Pure - the readings are gathered
 * by ReminderService.getDeliveryInputs().
 *
 * A null reading means "could not tell" (old Android, iOS, missing native
 * module) and is reported as unknown - never as ok. Claiming a pass we did not
 * observe is the exact failure mode this screen exists to expose.
 */

export type ChannelLevel = "blocked" | "quiet" | "normal";

export interface DeliveryInputs {
  notificationsGranted: boolean | null;
  channelLevel: ChannelLevel | null;
  exactAlarm: boolean | null;
  ignoringBatteryOptimizations: boolean | null;
}

export type CheckStatus = "ok" | "problem" | "unknown";
export type CheckId = "notifications" | "channel" | "exact_alarm" | "battery";
export type FixAction = "app_settings" | "exact_alarm_settings" | "battery_settings";

export interface DeliveryCheck {
  id: CheckId;
  status: CheckStatus;
  title: string;
  detail: string;
  fix?: FixAction;
}

export interface DeliveryAssessment {
  checks: DeliveryCheck[];
  overall: CheckStatus;
}

function boolStatus(v: boolean | null): CheckStatus {
  if (v === null) return "unknown";
  return v ? "ok" : "problem";
}

const CONFIRMED_BY_TEST_DETAIL =
  "Could not be read directly, but a test reminder just arrived while the app " +
  "was open, so this isn't blocking delivery right now.";

/**
 * `confirmedByTestFire`: a test reminder was just sent and arrived. It cannot
 * upgrade a confirmed `problem` (the static reading is real; the test only
 * proves foreground delivery, not what happens once the app is backgrounded
 * or killed) but it can resolve an `unknown` reading to `ok` - "we could not
 * read this setting" and "delivery just worked anyway" are not a contradiction,
 * and leaving the check permanently unresolved after positive proof gives the
 * user no way to ever clear it.
 */
export function assessDelivery(
  i: DeliveryInputs,
  confirmedByTestFire = false
): DeliveryAssessment {
  const notif = boolStatus(i.notificationsGranted);
  const channel: CheckStatus =
    i.channelLevel === null ? "unknown" : i.channelLevel === "normal" ? "ok" : "problem";
  const exact = boolStatus(i.exactAlarm);
  const battery = boolStatus(i.ignoringBatteryOptimizations);

  const resolve = (s: CheckStatus): CheckStatus =>
    confirmedByTestFire && s === "unknown" ? "ok" : s;

  const notifR = resolve(notif);
  const channelR = resolve(channel);
  const exactR = resolve(exact);
  const batteryR = resolve(battery);

  const checks: DeliveryCheck[] = [
    {
      id: "notifications",
      status: notifR,
      title: "Notification permission",
      detail:
        notif === "ok"
          ? "Allowed."
          : notif === "problem"
            ? "Off - no reminder can appear at all."
            : notifR === "ok"
              ? CONFIRMED_BY_TEST_DETAIL
              : "Could not be read on this device.",
      ...(notif === "problem" ? { fix: "app_settings" as const } : {}),
    },
    {
      id: "channel",
      status: channelR,
      title: "Reminder notification style",
      detail:
        i.channelLevel === "blocked"
          ? "Reminder notifications are turned off in system settings."
          : i.channelLevel === "quiet"
            ? "Set to silent - reminders arrive without sound or a pop-up."
            : channel === "ok"
              ? "Reminders can make sound and pop up."
              : channelR === "ok"
                ? CONFIRMED_BY_TEST_DETAIL
                : "Could not be read on this device.",
      ...(channel === "problem" ? { fix: "app_settings" as const } : {}),
    },
    {
      id: "exact_alarm",
      status: exactR,
      title: "Alarms & reminders access",
      detail:
        exact === "ok"
          ? "Reminders fire at the exact minute."
          : exact === "problem"
            ? "Off - Android may delay reminders by several minutes or more."
            : exactR === "ok"
              ? CONFIRMED_BY_TEST_DETAIL
              : "Lets reminders fire at the exact minute instead of being delayed. " +
                "This phone doesn't report whether it's on - tap Fix in Settings to " +
                "check \"Alarms & reminders\" for this app directly, or send a test " +
                "reminder below to check delivery instead.",
      ...(exact === "problem" ? { fix: "exact_alarm_settings" as const } : {}),
    },
    {
      id: "battery",
      status: batteryR,
      title: "Battery optimization",
      detail:
        battery === "ok"
          ? "The app is exempt - the phone will not put it to sleep."
          : battery === "problem"
            ? "Battery optimization is on. Some phones stop the app in the background " +
              "and drop reminders. The Fix button opens this app's info page - look " +
              "for \"Battery\" or \"Battery usage\" there and choose Unrestricted / " +
              "Don't optimize (wording varies by phone)."
            : batteryR === "ok"
              ? CONFIRMED_BY_TEST_DETAIL
              : "Could not be read on this device.",
      ...(battery === "problem" ? { fix: "battery_settings" as const } : {}),
    },
  ];

  const overall: CheckStatus = checks.some((c) => c.status === "problem")
    ? "problem"
    : checks.some((c) => c.status === "unknown")
      ? "unknown"
      : "ok";

  return { checks, overall };
}
