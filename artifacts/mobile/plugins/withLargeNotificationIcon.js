/**
 * Config plugin: sets Android's large notification icon (the colored square on
 * the right of an expanded notification).
 *
 * WHY A PLUGIN AND NOT JS: expo-notifications reads this from an
 * AndroidManifest meta-data key at notification-build time —
 *   expo.modules.notifications.large_notification_icon
 * (see ExpoNotificationBuilder.kt, `largeIcon`). There is no JS API for it on
 * a locally-scheduled notification: the builder's only other path is
 * `notificationContent.containsImage()`, and containsImage() is implemented
 * solely by RemoteNotificationContent (remote push, resolved from a download
 * URL). Local notifications never take that branch.
 *
 * WHY NOT EDIT THE MANIFEST BY HAND: android/ is prebuild-generated and
 * gitignored here, so a manual edit is wiped by the next `expo prebuild` and
 * can't be committed. Same trap as the CMake pin documented in CLAUDE.md.
 *
 * This is distinct from the small status-bar icon (`notification-icon.png`,
 * configured via the expo-notifications plugin's own `icon` option). Android
 * silhouettes THAT one — flattening every non-transparent pixel to a single
 * tinted shape — which is why a full-color app icon can't be used there.
 * The large icon has no such restriction and renders in full color.
 */
const { AndroidConfig, withAndroidManifest, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const META_DATA_KEY = "expo.modules.notifications.large_notification_icon";
const RESOURCE_NAME = "large_notification_icon";

// Android's large-icon slot renders around 64dp, so these are the pixel sizes
// per density bucket. Resizing here keeps a 1024px app icon from shipping at
// full resolution into every notification.
const DENSITIES = [
  { name: "mdpi", size: 64 },
  { name: "hdpi", size: 96 },
  { name: "xhdpi", size: 128 },
  { name: "xxhdpi", size: 192 },
  { name: "xxxhdpi", size: 256 },
];

function withLargeIconAsset(config, { icon }) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const source = path.resolve(cfg.modRequest.projectRoot, icon);
      if (!fs.existsSync(source)) {
        throw new Error(
          `withLargeNotificationIcon: asset not found at ${source}. ` +
            `Set the "icon" option to a path relative to the project root.`
        );
      }
      const { generateImageAsync } = require("@expo/image-utils");
      const resRoot = path.join(
        cfg.modRequest.platformProjectRoot,
        "app/src/main/res"
      );
      for (const { name, size } of DENSITIES) {
        const dir = path.join(resRoot, `drawable-${name}`);
        fs.mkdirSync(dir, { recursive: true });
        const { source: buffer } = await generateImageAsync(
          { projectRoot: cfg.modRequest.projectRoot, cacheType: "large-notification-icon" },
          {
            src: source,
            width: size,
            height: size,
            resizeMode: "cover",
            // Transparent rather than a color: the app icon is square and
            // fills the frame, so padding should never be visible.
            backgroundColor: "transparent",
          }
        );
        fs.writeFileSync(path.join(dir, `${RESOURCE_NAME}.png`), buffer);
      }
      return cfg;
    },
  ]);
}

function withLargeIconManifest(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      cfg.modResults
    );
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application,
      META_DATA_KEY,
      `@drawable/${RESOURCE_NAME}`,
      "resource"
    );
    return cfg;
  });
}

module.exports = function withLargeNotificationIcon(config, props = {}) {
  const icon = props.icon;
  if (!icon) {
    throw new Error('withLargeNotificationIcon: an "icon" option is required.');
  }
  return withLargeIconManifest(withLargeIconAsset(config, { icon }));
};
