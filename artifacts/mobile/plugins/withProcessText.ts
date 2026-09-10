import { ConfigPlugin, withAndroidManifest } from "@expo/config-plugins";

/**
 * Adds an ACTION_PROCESS_TEXT intent-filter to MainActivity, so the app appears
 * in the floating text-selection toolbar of every other Android app.
 *
 * Notes on the framework behaviour:
 * - The label belongs on the *intent-filter*, not on the activity: Android
 *   shows that label (and falls back to the app label) in the selection
 *   toolbar. Long labels are truncated there, so keep it short.
 * - MainActivity keeps its normal launchMode ("singleTask" in an Expo app), so
 *   Android reuses the running app instead of stacking a new instance for each
 *   selection. The selected text rides on the intent and is read by the
 *   `process-text` native module (modules/process-text).
 * - The filter must declare `text/plain`; Android only offers activities that
 *   accept that mime type.
 */
export const PROCESS_TEXT_LABEL = "Remind Me";

// Exported separately from the plugin so a unit test can call it on a parsed
// manifest without building a full Expo config. It mutates in place.
export function addProcessTextIntentFilter(manifest: any): void {
  const application = manifest?.manifest?.application?.[0];
  if (!application) return;

  const activities: any[] = (application.activity ?? []) as any[];
  const mainActivity =
    activities.find(
      (a) =>
        a.$?.["android:name"] === ".MainActivity" ||
        a.$?.["android:name"] === "com.expo.modules.MainActivity"
    ) ?? activities[0];

  if (!mainActivity) return;

  if (!mainActivity["intent-filter"]) {
    mainActivity["intent-filter"] = [];
  }
  const intentFilters: any[] = mainActivity["intent-filter"];

  const alreadyPresent = intentFilters.some((f) =>
    (f.action ?? []).some(
      (a: any) => a.$?.["android:name"] === "android.intent.action.PROCESS_TEXT"
    )
  );
  if (alreadyPresent) return;

  intentFilters.push({
    $: { "android:label": PROCESS_TEXT_LABEL },
    action: [{ $: { "android:name": "android.intent.action.PROCESS_TEXT" } }],
    category: [{ $: { "android:name": "android.intent.category.DEFAULT" } }],
    data: [{ $: { "android:mimeType": "text/plain" } }],
  });
}

const withProcessText: ConfigPlugin = (config) =>
  withAndroidManifest(config, (mod) => {
    addProcessTextIntentFilter(mod.modResults);
    return mod;
  });

export default withProcessText;
