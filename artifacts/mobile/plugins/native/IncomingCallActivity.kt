package com.curios.remindme

import android.app.Activity
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationManagerCompat

/**
 * B24 "Ring like a call". Launched only as the full-screen intent of a
 * reminder whose payload has `ringLikeCall: true` (see the builder hunk in
 * patches/expo-notifications@0.32.17.patch). Copied into the generated
 * android/ project by plugins/withIncomingCall.js -- edit THIS file, not the
 * copy under android/, which prebuild overwrites.
 *
 * Deliberately a separate Activity from MainActivity: it is the only screen
 * allowed over the lock screen, so the rest of the app (every other reminder)
 * stays behind the keyguard.
 *
 * Answer: stops ringing, asks the user to unlock, then dismisses the tray
 * notification and opens the reminder. Decline: stops ringing and leaves the tray
 * notification in place, so Snooze / Mark Done are still one swipe away.
 * Rings for at most RING_TIMEOUT_MS, then behaves like Decline.
 */
class IncomingCallActivity : Activity() {
  companion object {
    const val EXTRA_TITLE = "remindme.call.title"
    const val EXTRA_REMINDER_ID = "remindme.call.reminderId"
    const val EXTRA_NOTIFICATION_TAG = "remindme.call.notificationTag"
    const val EXTRA_NOTIFICATION_ID = "remindme.call.notificationId"
    private const val RING_TIMEOUT_MS = 60_000L
  }

  private var ringtone: Ringtone? = null
  private var vibrator: Vibrator? = null
  private val handler = Handler(Looper.getMainLooper())
  private val timeout = Runnable { stopRinging(); finish() }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    showOverLockScreen()
    setContentView(buildLayout(intent.getStringExtra(EXTRA_TITLE) ?: "Reminder"))
    startRinging()
    handler.postDelayed(timeout, RING_TIMEOUT_MS)
  }

  // singleInstance: a later ring (e.g. a snooze) while an earlier call screen
  // is still alive -- left silent behind an unlock, or after a cancelled
  // Answer -- arrives here instead of onCreate. Re-arm for the new reminder,
  // or the second ring is swallowed with no screen and no sound.
  override fun onNewIntent(newIntent: Intent) {
    super.onNewIntent(newIntent)
    setIntent(newIntent)
    handler.removeCallbacks(timeout)
    stopRinging()
    showOverLockScreen()
    setContentView(buildLayout(newIntent.getStringExtra(EXTRA_TITLE) ?: "Reminder"))
    startRinging()
    handler.postDelayed(timeout, RING_TIMEOUT_MS)
  }

  override fun onDestroy() {
    handler.removeCallbacks(timeout)
    stopRinging()
    super.onDestroy()
  }

  private fun showOverLockScreen() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else {
      @Suppress("DEPRECATION")
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
  }

  private fun dp(v: Int) = (v * resources.displayMetrics.density).toInt()

  private fun buildLayout(title: String): LinearLayout {
    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      gravity = Gravity.CENTER_HORIZONTAL
      setBackgroundColor(Color.parseColor("#1C1C1E"))
      setPadding(dp(24), dp(96), dp(24), dp(64))
    }
    root.addView(TextView(this).apply {
      text = "Incoming reminder"
      setTextColor(Color.parseColor("#AEAEB2"))
      textSize = 16f
      gravity = Gravity.CENTER
    })
    root.addView(TextView(this).apply {
      text = title
      setTextColor(Color.WHITE)
      textSize = 32f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setPadding(0, dp(16), 0, dp(8))
    })
    root.addView(TextView(this).apply {
      text = "Reminders"
      setTextColor(Color.parseColor("#AEAEB2"))
      textSize = 18f
      gravity = Gravity.CENTER
    })
    // Pushes the buttons to the bottom, where a call screen puts them.
    root.addView(
      android.view.View(this),
      LinearLayout.LayoutParams(0, 0, 1f)
    )
    val buttons = LinearLayout(this).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
    }
    buttons.addView(roundButton("Decline", "#FF3B30") { decline() })
    buttons.addView(
      android.view.View(this),
      LinearLayout.LayoutParams(dp(72), 1)
    )
    buttons.addView(roundButton("Answer", "#34C759") { answer() })
    root.addView(buttons)
    return root
  }

  private fun roundButton(label: String, color: String, onClick: () -> Unit) =
    Button(this).apply {
      text = label
      isAllCaps = false
      setTextColor(Color.WHITE)
      textSize = 16f
      background = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(Color.parseColor(color))
      }
      layoutParams = LinearLayout.LayoutParams(dp(96), dp(96))
      setOnClickListener { onClick() }
    }

  private fun startRinging() {
    val uri = RingtoneManager.getActualDefaultRingtoneUri(this, RingtoneManager.TYPE_RINGTONE)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
    ringtone = RingtoneManager.getRingtone(this, uri)?.apply {
      audioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) isLooping = true
      play()
    }
    @Suppress("DEPRECATION")
    vibrator = (getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator)?.also {
      val pattern = longArrayOf(0, 1000, 1000)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        it.vibrate(VibrationEffect.createWaveform(pattern, 0))
      } else {
        @Suppress("DEPRECATION")
        it.vibrate(pattern, 0)
      }
    }
  }

  private fun stopRinging() {
    ringtone?.stop()
    ringtone = null
    vibrator?.cancel()
    vibrator = null
  }

  private fun decline() {
    stopRinging()
    finish()
  }

  private fun answer() {
    stopRinging()
    val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && keyguard.isKeyguardLocked) {
      keyguard.requestDismissKeyguard(this, object : KeyguardManager.KeyguardDismissCallback() {
        override fun onDismissSucceeded() = openReminder()
        // Unlock cancelled: stay on this (now silent) screen so Answer can be
        // pressed again; the tray notification is untouched.
      })
    } else {
      openReminder()
    }
  }

  private fun openReminder() {
    // Only now, once the reminder is actually opening: the tray entry is the
    // fallback if the unlock above is abandoned.
    val tag = intent.getStringExtra(EXTRA_NOTIFICATION_TAG)
    if (tag != null) {
      NotificationManagerCompat.from(this)
        .cancel(tag, intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0))
    }
    val reminderId = intent.getStringExtra(EXTRA_REMINDER_ID)
    val open = if (reminderId != null) {
      // expo-router deep link; scheme is app.json's "scheme".
      Intent(Intent.ACTION_VIEW, Uri.parse("mobile://reminder-detail?id=${Uri.encode(reminderId)}"))
        .setPackage(packageName)
    } else {
      packageManager.getLaunchIntentForPackage(packageName)
    }
    open?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)?.let { startActivity(it) }
    finish()
  }
}
