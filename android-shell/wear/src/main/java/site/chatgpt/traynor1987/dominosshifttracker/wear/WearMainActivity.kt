package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.MotionEvent
import android.view.ViewGroup
import android.widget.Button
import android.widget.Chronometer
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMap
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import kotlin.math.abs

class WearMainActivity : Activity(), DataClient.OnDataChangedListener, MessageClient.OnMessageReceivedListener {
    private lateinit var root: FrameLayout
    private lateinit var main: FrameLayout
    private lateinit var dial: WearDialView
    private lateinit var state: TextView
    private lateinit var timer: Chronometer
    private lateinit var detail: TextView
    private lateinit var actionStatus: TextView
    private lateinit var actions: ArcActionLayout
    private var showingInfo = false
    private var swipeStartX = 0f
    private var swipeStartY = 0f
    private var lastFeedbackOutcome = ""
    private val handler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        build()
        request()
        render()
    }

    override fun onResume() {
        super.onResume()
        Wearable.getDataClient(this).addListener(this)
        Wearable.getMessageClient(this).addListener(this)
        if (hasReadyWearUpdate(this)) startActivity(Intent(this, WearUpdateActivity::class.java))
        request()
        render()
    }

    override fun onPause() {
        Wearable.getDataClient(this).removeListener(this)
        Wearable.getMessageClient(this).removeListener(this)
        handler.removeCallbacksAndMessages(null)
        super.onPause()
    }

    override fun onDataChanged(events: DataEventBuffer) {
        events.use { buffer ->
            buffer.forEach { event ->
                if (event.dataItem.uri.path != WearState.STATE_PATH) return@forEach
                if (event.type == DataEvent.TYPE_DELETED) WearState.clear(this)
                else event.dataItem.data?.let { bytes ->
                    DataMap.fromByteArray(bytes).getString("snapshot")?.let { WearState.save(this, it) }
                }
            }
        }
        runOnUiThread { render() }
    }

    override fun onMessageReceived(event: MessageEvent) {
        if (event.path != WearState.RESULT_PATH) return
        WearState.updateActionFeedback(this, event.data.toString(Charsets.UTF_8))
        runOnUiThread {
            render()
            handler.postDelayed({ render() }, WearReliabilityPolicy.ACTION_RESULT_VISIBLE_MS)
        }
        request()
    }

    private fun build() {
        root = FrameLayout(this).apply { setBackgroundColor(Color.BLACK) }
        main = FrameLayout(this)
        root.addView(main)
        dial = WearDialView(this)
        main.addView(dial, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))

        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(28), dp(16), dp(28), 0)
        }
        fun text(size: Float, colour: Int) = TextView(this).apply {
            textSize = size
            setTextColor(colour)
            gravity = Gravity.CENTER
            includeFontPadding = false
        }
        panel.addView(ImageView(this).apply {
            setImageResource(R.drawable.ic_shift_tracker)
            contentDescription = "Shift Tracker"
        }, LinearLayout.LayoutParams(dp(23), dp(23)).apply { bottomMargin = dp(2) })
        panel.addView(text(11f, Color.rgb(35, 161, 255)).apply { this.text = "SHIFT TRACKER" })
        state = text(19f, Color.WHITE)
        panel.addView(state)
        timer = Chronometer(this).apply {
            textSize = 34f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            includeFontPadding = false
        }
        panel.addView(timer)
        detail = text(12f, Color.rgb(222, 218, 210))
        panel.addView(detail)
        actionStatus = text(10f, Color.rgb(105, 205, 180))
        panel.addView(actionStatus, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(3) })
        main.addView(panel, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP))

        actions = ArcActionLayout(this)
        main.addView(actions, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        main.addView(infoButton(), FrameLayout.LayoutParams(dp(48), dp(48), Gravity.TOP or Gravity.END).apply {
            topMargin = dp(6)
            rightMargin = dp(7)
        })
        setContentView(root)
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                swipeStartX = event.x
                swipeStartY = event.y
            }
            MotionEvent.ACTION_UP -> {
                val horizontal = event.x - swipeStartX
                val vertical = event.y - swipeStartY
                if (abs(horizontal) > dp(55) && abs(horizontal) > abs(vertical) * 1.2f) {
                    if (horizontal > 0) showInfo() else showMain()
                    return true
                }
            }
        }
        return super.dispatchTouchEvent(event)
    }

    private fun showInfo() {
        showingInfo = true
        root.keepScreenOn = false
        timer.stop()
        root.removeAllViews()
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(28), dp(34), dp(28), dp(24))
        }
        fun text(size: Float, colour: Int) = TextView(this).apply {
            textSize = size
            setTextColor(colour)
            gravity = Gravity.CENTER
            includeFontPadding = false
        }
        val connected = WearState.read(this)?.disconnected == false
        val status = if (connected) "PHONE CONNECTED" else "PHONE NOT CONNECTED"
        val hint = if (connected) "● Live shift data available" else "● Open phone app to reconnect"
        panel.addView(text(12f, Color.rgb(35, 161, 255)).apply { this.text = "SHIFT TRACKER" })
        panel.addView(text(21f, Color.WHITE).apply { this.text = status })
        panel.addView(text(12f, if (connected) Color.rgb(70, 205, 170) else Color.rgb(239, 105, 90)).apply { this.text = hint }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(8)
            bottomMargin = dp(20)
        })
        panel.addView(settingsButton(), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(48)))
        val version = packageManager.getPackageInfo(packageName, 0).versionName ?: ""
        panel.addView(text(12f, Color.rgb(222, 218, 210)).apply {
            this.text = "ABOUT\nShift Tracker Wear $version\n\nSwipe left to return"
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(18) })
        root.addView(ScrollView(this).apply { addView(panel) }, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }

    private fun showMain() {
        if (!showingInfo) return
        showingInfo = false
        root.removeAllViews()
        root.addView(main)
        render()
    }

    private fun infoButton() = Button(this).apply {
        text = "ⓘ"
        textSize = 18f
        gravity = Gravity.CENTER
        includeFontPadding = false
        isAllCaps = false
        setPadding(0, 0, 0, 0)
        setTextColor(Color.WHITE)
        contentDescription = "Settings and About"
        background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(Color.rgb(35, 35, 38))
            setStroke(dp(2), Color.rgb(90, 170, 235))
        }
        setOnClickListener { showInfo() }
    }

    private fun settingsButton() = Button(this).apply {
        text = "APP SETTINGS"
        textSize = 13f
        isAllCaps = false
        setTextColor(Color.WHITE)
        background = GradientDrawable().apply {
            cornerRadius = dp(24).toFloat()
            setColor(Color.rgb(8, 117, 209))
            setStroke(dp(2), Color.rgb(120, 190, 255))
        }
        setOnClickListener { startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:$packageName"))) }
    }

    private fun render() {
        if (showingInfo) {
            showInfo()
            return
        }
        val snapshot = WearState.read(this)
        val feedback = WearState.readActionFeedback(this)?.takeIf { it.visible }
        val pending = feedback?.pending == true
        actions.removeAllViews()
        actionStatus.text = feedback?.let(::feedbackText).orEmpty()
        actionStatus.setTextColor(if (feedback?.outcome in setOf("stale_state", "invalid_action", "error", "not_connected", "send_failed")) Color.rgb(239, 105, 90) else Color.rgb(105, 205, 180))
        feedback?.outcome?.takeIf { it != lastFeedbackOutcome && it !in setOf("sending", "queued") }?.let { outcome ->
            lastFeedbackOutcome = outcome
            root.performHapticFeedback(if (outcome in setOf("applied", "already_applied")) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.REJECT)
        }

        if (snapshot == null || snapshot.disconnected) {
            root.keepScreenOn = false
            dial.accent = Color.rgb(224, 163, 56)
            dial.progress = .15f
            state.setTextColor(Color.rgb(224, 163, 56))
            state.text = "PHONE DISCONNECTED"
            timer.stop()
            timer.text = "STATE STALE"
            detail.text = "Open phone to reconnect"
            actions.addView(openPhoneButton())
            actions.requestLayout()
            return
        }
        if (!snapshot.active) {
            root.keepScreenOn = false
            dial.accent = Color.rgb(8, 117, 209)
            dial.progress = .22f
            state.setTextColor(Color.WHITE)
            state.text = "CLOCKED OUT"
            timer.stop()
            timer.text = "OFF"
            detail.text = "Open phone to start a shift"
            actions.addView(openPhoneButton())
            actions.requestLayout()
            return
        }

        root.keepScreenOn = true
        val delivery = snapshot.activity.startsWith("delivery_")
        val colour = when (snapshot.activity) {
            "delivery_single" -> Color.rgb(239, 29, 69)
            "delivery_double" -> Color.rgb(8, 117, 209)
            "break" -> Color.rgb(224, 163, 56)
            else -> Color.rgb(28, 157, 130)
        }
        dial.accent = colour
        dial.progress = if (delivery) .72f else .5f
        state.setTextColor(colour)
        state.text = when (snapshot.activity) {
            "delivery_single" -> "SINGLE DELIVERY"
            "delivery_double" -> "DOUBLE DELIVERY"
            "break" -> "BREAK"
            "cleaning" -> "CLEANING"
            "prep" -> "PREP"
            "task" -> "TASK"
            else -> "AT STORE"
        }
        val start = if (snapshot.activity == "idle") snapshot.shiftStarted else snapshot.activityStarted
        val now = System.currentTimeMillis()
        timer.base = if (start in 1..now + 60_000L) SystemClock.elapsedRealtime() - (now - start).coerceAtLeast(0L) else SystemClock.elapsedRealtime()
        timer.start()
        val where = when (snapshot.storeStatus) {
            "at_store" -> "AT STORE"
            "outside_store" -> "OUTSIDE STORE"
            "detecting" -> "DETECTING GPS"
            else -> ""
        }
        detail.text = "${snapshot.deliveries} deliveries • ${snapshot.pay}${if (snapshot.name.isNotBlank()) "\n${snapshot.name}" else ""}${if (where.isNotBlank()) " • $where" else ""}"

        listOf(
            "delivered" to "DELIVERED",
            "back_at_store" to "RETURN",
            "end_break" to "END BREAK",
            "complete_task" to "COMPLETE",
            "single" to "SINGLE",
            "double" to "DOUBLE",
            "break" to "BREAK",
        ).filter { it.first in snapshot.actions }.forEach { (action, label) ->
            actions.addView(actionButton(label, action, when {
                action == "single" || action == "delivered" && snapshot.activity == "delivery_single" -> Color.rgb(239, 29, 69)
                action == "double" || action == "delivered" -> Color.rgb(8, 117, 209)
                action == "break" || action == "end_break" -> Color.rgb(224, 163, 56)
                else -> Color.rgb(28, 157, 130)
            }, pending))
        }
        actions.requestLayout()
    }

    private fun feedbackText(feedback: WearActionFeedback): String = when (feedback.outcome) {
        "sending" -> "SENDING TO PHONE…"
        "queued" -> "PHONE PROCESSING…"
        "applied", "already_applied" -> "✓ DONE"
        "already_pending" -> "WAITING FOR PHONE…"
        "stale_state" -> "STATE CHANGED — TRY AGAIN"
        "invalid_action" -> "ACTION NO LONGER AVAILABLE"
        "not_connected" -> "PHONE NOT CONNECTED"
        "send_failed" -> "SEND FAILED — TRY AGAIN"
        else -> "ACTION FAILED — TRY AGAIN"
    }

    private fun actionButton(label: String, action: String, colour: Int, pending: Boolean) = Button(this).apply {
        text = label
        textSize = 11f
        gravity = Gravity.CENTER
        includeFontPadding = false
        isAllCaps = false
        setPadding(dp(4), 0, dp(4), 0)
        setTextColor(Color.WHITE)
        isEnabled = !pending
        alpha = if (pending) .55f else 1f
        background = GradientDrawable().apply {
            cornerRadius = dp(30).toFloat()
            setColor(colour)
            setStroke(dp(2), Color.argb(210, 255, 255, 255))
        }
        elevation = dp(5).toFloat()
        setOnClickListener {
            isEnabled = false
            actionStatus.text = "SENDING TO PHONE…"
            WearTransport.sendAction(this@WearMainActivity, action)
            resync()
        }
    }

    private fun openPhoneButton() = Button(this).apply {
        text = "OPEN ON PHONE"
        textSize = 11f
        gravity = Gravity.CENTER
        includeFontPadding = false
        isAllCaps = false
        setPadding(dp(4), 0, dp(4), 0)
        setTextColor(Color.WHITE)
        background = GradientDrawable().apply {
            cornerRadius = dp(30).toFloat()
            setColor(Color.rgb(8, 117, 209))
            setStroke(dp(2), Color.argb(210, 255, 255, 255))
        }
        elevation = dp(5).toFloat()
        setOnClickListener {
            detail.text = "Opening Shift Tracker on phone…"
            WearTransport.openPhone(this@WearMainActivity)
        }
    }

    private fun request() = WearTransport.requestState(this)

    private fun resync() {
        listOf(600L, 1_800L, 4_000L).forEach { delay -> handler.postDelayed({ request(); render() }, delay) }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt().coerceAtLeast(1)
}
