/**
 * Config plugin (B24 "Ring like a call"): installs IncomingCallActivity, the
 * call-style screen a `ringLikeCall` reminder's full-screen intent opens.
 *
 * Two parts, both needed:
 *   - copies plugins/native/IncomingCallActivity.kt into the generated
 *     android/ app sources (the file lives here because android/ is
 *     prebuild output);
 *   - registers the activity in AndroidManifest.xml. showWhenLocked /
 *     turnScreenOn are ALSO set in code; the manifest copy covers the window
 *     before onCreate runs, so the lock screen never flashes first.
 *
 * Plain JS for the same reason as withProcessText.js: config plugins are
 * loaded by a plain Node `require` during prebuild.
 */
const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("@expo/config-plugins");

const ACTIVITY_NAME = ".IncomingCallActivity";
const SOURCE = path.join(__dirname, "native", "IncomingCallActivity.kt");

function addIncomingCallActivity(application) {
  const activities = application.activity ?? (application.activity = []);
  if (activities.some((a) => a.$?.["android:name"] === ACTIVITY_NAME)) return;
  activities.push({
    $: {
      "android:name": ACTIVITY_NAME,
      "android:exported": "false",
      "android:showWhenLocked": "true",
      "android:turnScreenOn": "true",
      "android:excludeFromRecents": "true",
      "android:launchMode": "singleInstance",
      "android:taskAffinity": "",
      "android:screenOrientation": "portrait",
      "android:theme": "@android:style/Theme.Black.NoTitleBar.Fullscreen",
    },
  });
}

const withIncomingCall = (config) => {
  config = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (application) addIncomingCallActivity(application);
    return mod;
  });
  return withDangerousMod(config, [
    "android",
    (mod) => {
      const pkg = mod.android?.package ?? "com.curios.remindme";
      const dest = path.join(
        mod.modRequest.platformProjectRoot,
        "app/src/main/java",
        ...pkg.split("."),
        "IncomingCallActivity.kt"
      );
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(SOURCE, dest);
      return mod;
    },
  ]);
};

module.exports = withIncomingCall;
module.exports.default = withIncomingCall;
module.exports.addIncomingCallActivity = addIncomingCallActivity;
