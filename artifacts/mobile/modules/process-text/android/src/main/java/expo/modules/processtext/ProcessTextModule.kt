package expo.modules.processtext

import android.app.Activity
import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Bridges Android's ACTION_PROCESS_TEXT ("selected text in some other app") into JS.
 *
 * Framework behaviour this module works around:
 *
 * 1. The selected text arrives as an Intent *extra* (EXTRA_PROCESS_TEXT), not as
 *    Intent data. React Native's Linking API only exposes the data URI, so the
 *    extra is unreachable from JS without native code.
 * 2. MainActivity is launchMode="singleTask", so the first selection starts the
 *    activity (read it from `activity.intent` in `getInitialProcessText`), while
 *    every later selection while the app is alive arrives through onNewIntent
 *    (emitted here as the "onProcessText" event).
 * 3. `activity.intent` is sticky: it survives configuration changes and a
 *    process death + restore. We therefore *consume* the intent after reading it
 *    (clear the extras and reset the action), so a screen rotation does not
 *    re-inject text the user already handled.
 * 4. EXTRA_PROCESS_TEXT is a CharSequence (it can be styled text), not a String.
 */
class ProcessTextModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ProcessText")

    Events(PROCESS_TEXT_EVENT)

    // Returns the text of the launch intent, or null when the app was started
    // some other way (launcher icon, notification tap, share sheet).
    Function("getInitialProcessText") {
      val activity: Activity? = appContext.currentActivity
      val intent = activity?.intent ?: return@Function null
      val text = extractProcessText(intent)
      if (text != null) {
        consume(intent)
      }
      return@Function text
    }

    OnNewIntent { intent ->
      val text = extractProcessText(intent)
      if (text != null) {
        consume(intent)
        sendEvent(PROCESS_TEXT_EVENT, mapOf("text" to text))
      }
    }
  }

  private fun extractProcessText(intent: Intent): String? {
    if (intent.action != Intent.ACTION_PROCESS_TEXT) {
      return null
    }
    val text = intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString()?.trim()
    return if (text.isNullOrEmpty()) null else text
  }

  // Make the intent inert so the same selection is never delivered twice.
  private fun consume(intent: Intent) {
    intent.removeExtra(Intent.EXTRA_PROCESS_TEXT)
    intent.removeExtra(Intent.EXTRA_PROCESS_TEXT_READONLY)
    intent.action = Intent.ACTION_MAIN
  }

  companion object {
    private const val PROCESS_TEXT_EVENT = "onProcessText"
  }
}
