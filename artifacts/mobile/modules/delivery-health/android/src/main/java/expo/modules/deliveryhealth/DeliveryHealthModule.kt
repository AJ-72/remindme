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
 * The settings screen opened is the general "battery optimization" list
 * (ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS), not the one-tap
 * ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS dialog - the latter needs the
 * REQUEST_IGNORE_BATTERY_OPTIMIZATIONS permission, which Play policy restricts
 * to a narrow set of app categories.
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
      val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
      if (context !is android.app.Activity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      return@Function try {
        context.startActivity(intent)
        true
      } catch (e: Exception) {
        false
      }
    }
  }
}
