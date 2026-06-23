import {
  ConfigPlugin,
  withAndroidManifest,
} from "@expo/config-plugins";

const TASK_BROADCAST_RECEIVER =
  "expo.modules.taskManager.TaskBroadcastReceiver";

const BOOT_COMPLETED = "android.intent.action.BOOT_COMPLETED";
const QUICKBOOT_POWERON = "android.intent.action.QUICKBOOT_POWERON";

const withBootReceiver: ConfigPlugin = (config) => {
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (!application) return mod;

    if (!application.receiver) {
      application.receiver = [];
    }
    const receivers: any[] = application.receiver as any[];

    const alreadyPresent = receivers.some((r) => {
      if (r.$?.["android:name"] !== TASK_BROADCAST_RECEIVER) return false;
      const intentFilters: any[] = r["intent-filter"] ?? [];
      return intentFilters.some((f) => {
        const actions: string[] = (f.action ?? []).map(
          (a: any) => a.$?.["android:name"]
        );
        return (
          actions.includes(BOOT_COMPLETED) &&
          actions.includes(QUICKBOOT_POWERON)
        );
      });
    });

    if (!alreadyPresent) {
      receivers.push({
        $: {
          "android:name": TASK_BROADCAST_RECEIVER,
          "android:exported": "false",
        },
        "intent-filter": [
          {
            action: [
              { $: { "android:name": BOOT_COMPLETED } },
              { $: { "android:name": QUICKBOOT_POWERON } },
            ],
          },
        ],
      });
    }

    return mod;
  });
};

export default withBootReceiver;
