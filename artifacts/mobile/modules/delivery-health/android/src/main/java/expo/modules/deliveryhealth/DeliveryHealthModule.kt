package expo.modules.deliveryhealth

import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * B26 delivery self-check. PowerManager.isIgnoringBatteryOptimizations has no
 * JS equivalent in React Native or Expo, so it needs this small native bridge.
 *
 * The one-tap ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS dialog needs the
 * REQUEST_IGNORE_BATTERY_OPTIMIZATIONS permission, which Play policy restricts
 * to a narrow set of app categories, so it is not used here.
 *
 * Device-tested 2026-09-26: the general "battery optimization" list
 * (ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS) dropped the user at
 * Settings -> Apps -> Battery usage -> Reminders, a page with no toggle for
 * this setting on that OEM - a dead end. There is no
 * ACTION_APP_BATTERY_USAGE_SETTINGS constant (checked directly against
 * android.jar for this project's compileSdk - it does not exist; an earlier
 * version of this file referenced it and failed to compile).
 * ACTION_APPLICATION_DETAILS_SETTINGS with a package: URI needs no special
 * permission and opens this app's own "App info" page, which on stock
 * Android and most OEMs (including the one this was tested on) links one tap
 * deeper into a per-app battery section - closer to the actual toggle than
 * the general list, though still not the one-tap dialog. Try it first and
 * fall back to the general list only if the OS has no such page.
 */
class DeliveryHealthModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DeliveryHealth")

    Function("isIgnoringBatteryOptimizations") {
      val context = appContext.reactContext ?: return@Function null
      val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
        ?: return@Function null
      return@Function pm.isIgnoringBatteryOptimizations(context.packageName)
    }

    Function("openBatteryOptimizationSettings") {
      val context = appContext.currentActivity ?: appContext.reactContext ?: return@Function false
      val activityFlags = if (context !is android.app.Activity) Intent.FLAG_ACTIVITY_NEW_TASK else 0

      val appSpecific = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
        data = android.net.Uri.parse("package:${context.packageName}")
        if (activityFlags != 0) addFlags(activityFlags)
      }
      try {
        context.startActivity(appSpecific)
        return@Function true
      } catch (e: Exception) {
        // Falls through to the general list below (older Android has no app-specific screen).
      }

      val general = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
      if (activityFlags != 0) general.addFlags(activityFlags)
      return@Function try {
        context.startActivity(general)
        true
      } catch (e: Exception) {
        false
      }
    }
  }
}
