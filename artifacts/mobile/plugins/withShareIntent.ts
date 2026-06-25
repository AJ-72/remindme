import {
  ConfigPlugin,
  withAndroidManifest,
} from "@expo/config-plugins";

const withShareIntent: ConfigPlugin = (config) => {
  return withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (!application) return mod;

    if (!application.activity) {
      application.activity = [];
    }
    const activities: any[] = application.activity as any[];

    const mainActivity = activities.find(
      (a) =>
        a.$?.["android:name"] === ".MainActivity" ||
        a.$?.["android:name"] === "com.expo.modules.MainActivity"
    ) ?? activities[0];

    if (!mainActivity) return mod;

    if (!mainActivity["intent-filter"]) {
      mainActivity["intent-filter"] = [];
    }
    const intentFilters: any[] = mainActivity["intent-filter"];

    const alreadyPresent = intentFilters.some((f) => {
      const actions: string[] = (f.action ?? []).map(
        (a: any) => a.$?.["android:name"]
      );
      const dataEntries: any[] = f.data ?? [];
      return (
        actions.includes("android.intent.action.SEND") &&
        dataEntries.some(
          (d) => d.$?.["android:mimeType"] === "text/plain"
        )
      );
    });

    if (!alreadyPresent) {
      intentFilters.push({
        action: [{ $: { "android:name": "android.intent.action.SEND" } }],
        category: [
          { $: { "android:name": "android.intent.category.DEFAULT" } },
        ],
        data: [{ $: { "android:mimeType": "text/plain" } }],
      });
    }

    return mod;
  });
};

export default withShareIntent;
