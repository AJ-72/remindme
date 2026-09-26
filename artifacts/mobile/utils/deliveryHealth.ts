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

export function assessDelivery(i: DeliveryInputs): DeliveryAssessment {
  const notif = boolStatus(i.notificationsGranted);
  const channel: CheckStatus =
    i.channelLevel === null ? "unknown" : i.channelLevel === "normal" ? "ok" : "problem";
  const exact = boolStatus(i.exactAlarm);
  const battery = boolStatus(i.ignoringBatteryOptimizations);

  const checks: DeliveryCheck[] = [
    {
      id: "notifications",
      status: notif,
      title: "Notification permission",
      detail:
        notif === "ok"
          ? "Allowed."
          : notif === "problem"
            ? "Off - no reminder can appear at all."
            : "Could not be read on this device.",
      ...(notif === "problem" ? { fix: "app_settings" as const } : {}),
    },
    {
      id: "channel",
      status: channel,
      title: "Reminder notification style",
      detail:
        i.channelLevel === "blocked"
          ? "Reminder notifications are turned off in system settings."
          : i.channelLevel === "quiet"
            ? "Set to silent - reminders arrive without sound or a pop-up."
            : channel === "ok"
              ? "Reminders can make sound and pop up."
              : "Could not be read on this device.",
      ...(channel === "problem" ? { fix: "app_settings" as const } : {}),
    },
    {
      id: "exact_alarm",
      status: exact,
      title: "Alarms & reminders access",
      detail:
        exact === "ok"
          ? "Reminders fire at the exact minute."
          : exact === "problem"
            ? "Off - Android may delay reminders by several minutes or more."
            : "Not needed or not readable on this Android version.",
      ...(exact === "problem" ? { fix: "exact_alarm_settings" as const } : {}),
    },
    {
      id: "battery",
      status: battery,
      title: "Battery optimization",
      detail:
        battery === "ok"
          ? "The app is exempt - the phone will not put it to sleep."
          : battery === "problem"
            ? "On - some phones stop the app in the background and drop reminders."
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
