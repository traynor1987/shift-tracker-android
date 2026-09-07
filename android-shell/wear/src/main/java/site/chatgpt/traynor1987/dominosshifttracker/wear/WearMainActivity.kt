package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.text.TextUtils
import android.view.View
import android.view.Gravity
import android.view.HapticFeedbackConstants
import android.view.InputDevice
import android.view.MotionEvent
import android.view.ViewGroup
import android.view.ViewConfiguration
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
import androidx.wear.ambient.AmbientLifecycleObserver

class WearMainActivity : androidx.activity.ComponentActivity(), DataClient.OnDataChangedListener, MessageClient.OnMessageReceivedListener {
    private enum class Screen { MAIN, SUMMARY, TASKS, INFO, BATTERY }

    private lateinit var root: FrameLayout
    private lateinit var main: FrameLayout
    private lateinit var dial: WearDialView
    private lateinit var state: TextView
    private lateinit var timerLabel: TextView
    private lateinit var timer: Chronometer
    private lateinit var detail: TextView
    private lateinit var contextDetail: TextView
    private lateinit var actionStatus: TextView
    private lateinit var actions: ArcActionLayout
    private var screen = Screen.MAIN
    private var swipeStartX = 0f
    private var swipeStartY = 0f
    private var lastFeedbackOutcome = ""
    private var activeScrollView: ScrollView? = null
    private val handler = Handler(Looper.getMainLooper())
    private val feedbackRefresh = Runnable { render() }
    private val settingsListener = android.content.SharedPreferences.OnSharedPreferenceChangeListener { _, key ->
        if (key == "records") handler.post {
            if (dimmed && !systemAmbient && (!WearPreferences.keepAwake(this) || !WearPreferences.batterySaverDisplay(this))) wakeDisplay()
            render(); scheduleDim()
        }
    }
    private val mirrorListener = android.content.SharedPreferences.OnSharedPreferenceChangeListener { _, _ ->
        runOnUiThread {
            if (lifecycle.currentState.isAtLeast(androidx.lifecycle.Lifecycle.State.RESUMED)) render()
        }
    }

    private var breakConfirmation: android.app.Dialog? = null
    private val notificationPermission = registerForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission()
    ) { WearShiftOngoing.reconcile(this) }

    private fun requestAmbientNotification() {
        if (android.os.Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            val prefs = getSharedPreferences("wear_display_permission", MODE_PRIVATE)
            if (!prefs.getBoolean("asked", false)) {
                prefs.edit().putBoolean("asked", true).apply()
                notificationPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    private var dimmed = false
    private var systemAmbient = false
    private var lowBit = false
    private var restoreScroll = 0
    private var wakeGuardUntil = 0L
    private var consumeWakeTouch = false
    private val dimTick = object : Runnable {
        override fun run() {
            if (dimmed && !systemAmbient) {
                showDim()
                handler.postDelayed(this, 60_000L)
            }
        }
    }
    private val dimTask = Runnable {
        if (breakConfirmation?.isShowing != true && screen == Screen.MAIN && WearPreferences.keepAwake(this) && WearPreferences.batterySaverDisplay(this) && WearState.read(this)?.active == true) enterDim()
    }
    private val ambientObserver by lazy {
        AmbientLifecycleObserver(this, object : AmbientLifecycleObserver.AmbientLifecycleCallback {
            override fun onEnterAmbient(ambientDetails: AmbientLifecycleObserver.AmbientDetails) {
                systemAmbient = true
                lowBit = ambientDetails.deviceHasLowBitAmbient
                enterDim()
            }
            override fun onUpdateAmbient() { if (dimmed) showDim() }
            override fun onExitAmbient() {
                systemAmbient = false
                wakeDisplay()
            }
        })
    }

    private fun scheduleDim() {
        handler.removeCallbacks(dimTask)
        if (!dimmed && !systemAmbient && WearPreferences.keepAwake(this) && WearPreferences.batterySaverDisplay(this))
            handler.postDelayed(dimTask, WearPreferences.dimDelay(this))
    }
    private fun enterDim() {
        if (!dimmed) restoreScroll = activeScrollView?.scrollY ?: 0
        dimmed = true
        handler.removeCallbacksAndMessages(null)
        timer.stop()
        root.keepScreenOn = false
        window.attributes = window.attributes.apply { screenBrightness = 0.05f }
        showDim()
        if (!systemAmbient) handler.postDelayed(dimTick, 60_000L)
    }
    private fun showDim() {
        WearBatteryReport.sample(this)
        root.removeAllViews()
        val snapshot = WearState.read(this)
        val now = System.currentTimeMillis()
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER
            setPadding(dp(34), dp(34), dp(34), dp(34))
            // Shift sparse text every minute, with generous round-screen insets.
            translationX = ((now / 60_000L % 5) - 2).toFloat() * resources.displayMetrics.density
            translationY = ((now / 300_000L % 5) - 2).toFloat() * resources.displayMetrics.density
        }
        fun line(value: String, size: Float) = TextView(this).apply {
            text = value; textSize = size; gravity = Gravity.CENTER
            setTextColor(if (lowBit) Color.WHITE else Color.LTGRAY)
            paint.isAntiAlias = !lowBit
            includeFontPadding = false
        }
        panel.addView(line(android.text.format.DateFormat.getTimeFormat(this).format(java.util.Date(now)), 25f))
        val valid = snapshot != null && !snapshot.disconnected && snapshot.active
        panel.addView(line(if (valid) WearDisplayPolicy.activityTitle(snapshot!!.activity) else if (snapshot?.active == true) "WAITING FOR PHONE" else "OFF SHIFT", 13f))
        if (valid) {
            val start = if (snapshot!!.activity == "idle") snapshot.shiftStarted else snapshot.activityStarted
            if (start in 1..now) panel.addView(line("Started ${android.text.format.DateFormat.getTimeFormat(this).format(java.util.Date(start))}", 12f))
            panel.addView(line("${snapshot.deliveries} deliveries", 12f))
        }
        panel.addView(line("Tap or Back to wake", 10f))
        root.addView(panel, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
    }
    private fun wakeDisplay(): Boolean {
        if (!dimmed) return false
        if (systemAmbient) return true // Wear OS owns the actual power-state transition.
        handler.removeCallbacks(dimTick)
        dimmed = false
        lowBit = false
        wakeGuardUntil = SystemClock.elapsedRealtime() + 700L
        window.attributes = window.attributes.apply { screenBrightness = -1f }
        root.removeAllViews()
        if (screen == Screen.MAIN) root.addView(main)
        render()
        (activeScrollView as? WearPageScrollView)?.restoreBeforeDraw(restoreScroll)
        scheduleDim()
        return true
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WearSettingsSync.initialize(this)
        build()
        lifecycle.addObserver(ambientObserver)
        onBackPressedDispatcher.addCallback(this, object : androidx.activity.OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (wakeDisplay() || SystemClock.elapsedRealtime() < wakeGuardUntil) return
                scheduleDim()
                when (screen) {
                    Screen.BATTERY -> showInfo()
                    Screen.TASKS -> showSummary()
                    Screen.SUMMARY, Screen.INFO -> showMain()
                    Screen.MAIN -> Unit
                }
            }
        })
        request()
        render()
    }

    private var phoneLink = "Checking…"
    private var shownUpdate = ""
    private val updateListener = android.content.SharedPreferences.OnSharedPreferenceChangeListener { _, _ ->
        runOnUiThread {
            openPendingUpdate()
            if (!dimmed && !systemAmbient && screen == Screen.INFO) showInfo()
        }
    }
    private fun openPendingUpdate() {
        if (dimmed || systemAmbient) return
        val prefs = getSharedPreferences("wear_update", MODE_PRIVATE)
        val token = prefs.getString("transfer_token", "").orEmpty()
        if (WearUpdateUi.isVisible(this) && token != shownUpdate && token != prefs.getString("dismissed_token", null)) {
            shownUpdate = token
            startActivity(Intent(this, WearUpdateActivity::class.java))
        }
    }

    override fun onResume() {
        super.onResume()
        if (!ambientObserver.isAmbient) { systemAmbient = false; wakeDisplay() }
        getSharedPreferences(WearState.PREFS, MODE_PRIVATE).registerOnSharedPreferenceChangeListener(mirrorListener)
        getSharedPreferences("wear_settings_sync_v1", MODE_PRIVATE).registerOnSharedPreferenceChangeListener(settingsListener)
        WearSettingsSync.store(this).refresh()
        Wearable.getDataClient(this).addListener(this)
        Wearable.getMessageClient(this).addListener(this)
        getSharedPreferences("wear_update", MODE_PRIVATE).registerOnSharedPreferenceChangeListener(updateListener)
        openPendingUpdate()
        WearBreakReminder.reconcile(this)
        WearShiftOngoing.reconcile(this)
        if (WearPreferences.keepAwake(this)) requestAmbientNotification()
        Wearable.getNodeClient(this).connectedNodes.addOnSuccessListener { nodes ->
            phoneLink = if (nodes.isEmpty()) "Disconnected" else if (nodes.any { it.isNearby }) "Nearby" else "Remote link"
            if (lifecycle.currentState.isAtLeast(androidx.lifecycle.Lifecycle.State.RESUMED)) render()
        }.addOnFailureListener { phoneLink = "Unavailable" }
        request()
        render()
        scheduleDim()
    }

    override fun onPause() {
        getSharedPreferences("wear_settings_sync_v1", MODE_PRIVATE).unregisterOnSharedPreferenceChangeListener(settingsListener)
        getSharedPreferences(WearState.PREFS, MODE_PRIVATE).unregisterOnSharedPreferenceChangeListener(mirrorListener)
        getSharedPreferences("wear_update", MODE_PRIVATE).unregisterOnSharedPreferenceChangeListener(updateListener)
        Wearable.getDataClient(this).removeListener(this)
        Wearable.getMessageClient(this).removeListener(this)
        handler.removeCallbacksAndMessages(null)
        timer.stop()
        window.attributes = window.attributes.apply { screenBrightness = -1f }
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
            setPadding(dp(26), dp(12), dp(26), 0)
        }
        fun text(size: Float, colour: Int) = TextView(this).apply {
            textSize = size
            setTextColor(colour)
            gravity = Gravity.CENTER
            includeFontPadding = false
        }
        panel.addView(ImageView(this).apply {
            setImageResource(R.drawable.ic_shift_tracker)
            contentDescription = "Shift Tracker settings"
            setPadding(dp(12), 0, dp(12), 0)
            isClickable = true; isFocusable = true
            setOnClickListener { showInfo() }
        }, LinearLayout.LayoutParams(dp(48), dp(24)).apply { bottomMargin = dp(4) })
        state = text(17f, Color.WHITE)
        panel.addView(state)
        timerLabel = text(8f, Color.LTGRAY).apply { visibility = View.GONE }
        panel.addView(timerLabel)
        timer = Chronometer(this).apply {
            textSize = 32f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            includeFontPadding = false
        }
        panel.addView(timer)
        detail = text(11f, Color.rgb(222, 218, 210))
        panel.addView(detail)
        contextDetail = text(9f, Color.rgb(224, 163, 56)).apply {
            maxLines = 2
            ellipsize = TextUtils.TruncateAt.END
        }
        panel.addView(contextDetail, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(1) })
        actionStatus = text(9f, Color.rgb(105, 205, 180))
        panel.addView(actionStatus, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(1) })
        main.addView(panel, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP))

        actions = ArcActionLayout(this)
        main.addView(actions, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
    }

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        if (event.actionMasked == MotionEvent.ACTION_DOWN) {
            consumeWakeTouch = dimmed || SystemClock.elapsedRealtime() < wakeGuardUntil
            if (dimmed) wakeDisplay()
            scheduleDim()
        }
        if (consumeWakeTouch) {
            if (event.actionMasked == MotionEvent.ACTION_UP || event.actionMasked == MotionEvent.ACTION_CANCEL) consumeWakeTouch = false
            return true
        }
        when (event.actionMasked) {
            MotionEvent.ACTION_DOWN -> {
                swipeStartX = event.x
                swipeStartY = event.y
            }
            MotionEvent.ACTION_UP -> {
                val horizontal = event.x - swipeStartX
                val vertical = event.y - swipeStartY
                if (abs(horizontal) > dp(55) && abs(horizontal) > abs(vertical) * 1.2f) {
                    val cancel = MotionEvent.obtain(event).apply { action = MotionEvent.ACTION_CANCEL }
                    super.dispatchTouchEvent(cancel)
                    cancel.recycle()
                    when (screen) {
                        Screen.MAIN -> if (horizontal > 0) showInfo() else showSummary()
                        Screen.SUMMARY -> if (horizontal > 0) showMain() else Unit
                        Screen.TASKS -> if (horizontal > 0) showSummary() else Unit
                        Screen.INFO -> if (horizontal < 0) showMain() else Unit
                        Screen.BATTERY -> if (horizontal > 0) showInfo() else Unit
                    }
                    return true
                }
            }
        }
        return super.dispatchTouchEvent(event)
    }

    override fun onGenericMotionEvent(event: MotionEvent): Boolean {
        if (wakeDisplay()) return true
        scheduleDim()
        if (event.action == MotionEvent.ACTION_SCROLL && event.isFromSource(InputDevice.SOURCE_ROTARY_ENCODER)) {
            val distance = -event.getAxisValue(MotionEvent.AXIS_SCROLL) * ViewConfiguration.get(this).scaledVerticalScrollFactor
            activeScrollView?.scrollBy(0, distance.toInt())
            return activeScrollView != null
        }
        return super.onGenericMotionEvent(event)
    }

    private fun presentPage(next: Screen, panel: LinearLayout) {
        val previous = activeScrollView as? WearPageScrollView
        val reuse = screen == next && previous?.parent === root
        val position = if (screen == next) previous?.scrollY ?: 0 else 0
        val scroll = if (reuse) requireNotNull(previous) else WearPageScrollView(this).apply {
            isFocusable = true
            setBackgroundColor(Color.BLACK)
        }
        scroll.replaceContent(panel, position)
        if (!reuse) {
            root.removeAllViews()
            root.addView(scroll, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        }
        screen = next
        activeScrollView = scroll
    }

    private fun showInfo() {
        root.keepScreenOn = false
        timer.stop()
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
        val snapshot = WearState.read(this)
        val connected = snapshot?.disconnected == false
        val status = if (connected) "PHONE CONNECTED" else "PHONE NOT CONNECTED"
        val hint = if (connected) "● ${WearDisplayPolicy.syncAgeLabel(snapshot?.updatedAt ?: 0L)}" else "● Open phone app to reconnect"
        panel.addView(text(12f, Color.rgb(35, 161, 255)).apply { this.text = "SHIFT TRACKER" })
        if (WearUpdateUi.isVisible(this)) {
            val ready = hasReadyWearUpdate(this)
            panel.addView(summaryAction(if (ready) "UPDATE READY · OPEN" else "UPDATE PROGRESS",
                if (ready) Color.rgb(28, 157, 130) else Color.rgb(8, 117, 209)) {
                startActivity(Intent(this, WearUpdateActivity::class.java))
            }, rowParams(8))
            if (ready) panel.addView(summaryText("Saved on watch · install when ready", 10f, Color.LTGRAY, false), rowParams(4))
        }
        panel.addView(text(21f, Color.WHITE).apply { this.text = status })
        panel.addView(text(12f, if (connected) Color.rgb(70, 205, 170) else Color.rgb(239, 105, 90)).apply { this.text = hint }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
            topMargin = dp(8)
            bottomMargin = dp(12)
        })
        val battery = getSystemService(android.os.BatteryManager::class.java)
        val level = battery.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY)
        panel.addView(summaryText("WATCH STATUS", 11f, Color.rgb(35, 161, 255), true), rowParams(8))
        panel.addView(summaryRow("BATTERY", if (level in 0..100) "$level%" else "Unknown"))
        panel.addView(summaryRow("CHARGING", if (battery.isCharging) "Yes" else "No"))
        panel.addView(summaryRow("POWER SAVER", if (getSystemService(android.os.PowerManager::class.java).isPowerSaveMode) "On" else "Off"))
        panel.addView(summaryRow("PHONE LINK", phoneLink))
        panel.addView(summaryText("Link status checked when app opens; sync age shows data freshness.", 10f, Color.LTGRAY, false), rowParams(5))
        panel.addView(summaryText("MAIN SCREEN", 11f, Color.rgb(35, 161, 255), true), rowParams(12))
        panel.addView(summaryAction("TIMER · ${if (WearPreferences.mainTimer(this) == "shift") "SHIFT" else "ACTIVITY"}", Color.rgb(76, 85, 96)) {
            WearPreferences.cycleMainTimer(this); showInfo()
        }, rowParams(5))
        panel.addView(summaryAction("STAT · ${WearPreferences.mainStats[WearPreferences.mainStat(this)]?.uppercase()}", Color.rgb(76, 85, 96)) {
            WearPreferences.cycleMainStat(this); showInfo()
        }, rowParams(5))
        panel.addView(preferenceButton("BREAK PROGRESS RING", WearPreferences.breakRing(this)) {
            WearPreferences.toggleBreakRing(this); showInfo()
        }, rowParams(5))
        panel.addView(preferenceButton("BATTERY TRACKING", WearPreferences.batteryTracking(this)) {
            WearPreferences.toggleBatteryTracking(this); showInfo()
        }, rowParams(5))
        panel.addView(summaryAction("SHIFT BATTERY REPORTS", Color.rgb(8, 117, 209)) { showBatteryReport() }, rowParams(5))
        panel.addView(summaryText("BREAK & GOALS", 11f, Color.rgb(35, 161, 255), true), rowParams(12))
        panel.addView(summaryAction("BREAK TARGET · ${WearGoals.breakMinutes(this)} MIN", Color.rgb(76, 85, 96)) {
            WearGoals.cycle(this, "break_minutes", listOf(5, 10, 15, 20, 30, 45, 60), WearGoals.breakMinutes(this))
            WearBreakReminder.reconcile(this); showInfo()
        }, rowParams(5))
        panel.addView(preferenceButton("BREAK VIBRATION", WearGoals.breakAlert(this)) {
            WearGoals.toggleBreakAlert(this); WearBreakReminder.reconcile(this); showInfo()
        }, rowParams(5))
        if (!WearBreakReminder.precise(this)) panel.addView(summaryAction("PRECISE BREAK ALERTS", Color.rgb(8, 117, 209)) {
            if (android.os.Build.VERSION.SDK_INT >= 31) runCatching {
                startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName")))
            }
        }, rowParams(5))
        panel.addView(summaryText(if (WearBreakReminder.precise(this)) "Precise alerts enabled. Breaks end only when you end them." else "Background alerts may be delayed without alarm access.", 10f, Color.LTGRAY, false), rowParams(5))
        panel.addView(summaryAction("DELIVERY GOAL · ${WearGoals.deliveries(this).takeIf { it > 0 } ?: "OFF"}", Color.rgb(76, 85, 96)) {
            WearGoals.cycle(this, "deliveries", listOf(0, 10, 20, 30, 40, 50), WearGoals.deliveries(this)); showInfo()
        }, rowParams(5))
        panel.addView(summaryAction("PAID HOURS GOAL · ${WearGoals.hours(this).takeIf { it > 0 } ?: "OFF"}", Color.rgb(76, 85, 96)) {
            WearGoals.cycle(this, "hours", listOf(0, 4, 6, 8, 10, 12), WearGoals.hours(this)); showInfo()
        }, rowParams(5))
        panel.addView(preferenceButton("GEOFENCE VIBRATION", WearPreferences.hapticGeofence(this)) {
            WearPreferences.toggleHapticGeofence(this); showInfo()
        }, rowParams(5))
        panel.addView(preferenceButton("KEEP SCREEN AWAKE", WearPreferences.keepAwake(this)) {
            WearPreferences.toggleKeepAwake(this); WearShiftOngoing.reconcile(this);
            if (WearPreferences.keepAwake(this)) requestAmbientNotification()
            render(); scheduleDim()
        }, rowParams(5))
        panel.addView(preferenceButton("BATTERY SAVER DISPLAY", WearPreferences.batterySaverDisplay(this)) {
            WearPreferences.toggleBatterySaverDisplay(this); showInfo(); scheduleDim()
        }, rowParams(5))
        panel.addView(summaryAction("DIM AFTER ${WearPreferences.dimDelay(this) / 1_000}s", Color.rgb(76, 85, 96)) {
            WearPreferences.cycleDimDelay(this); showInfo(); scheduleDim()
        }, rowParams(5))
        panel.addView(summaryAction("PREVIEW DIM DISPLAY", Color.rgb(76, 85, 96)) { enterDim() }, rowParams(5))
        panel.addView(summaryText("Wrist wake and always-on follow watch display settings.", 10f, Color.LTGRAY, false), rowParams(5))
        panel.addView(preferenceButton("SHOW EARNINGS", WearPreferences.showEarnings(this)) {
            WearPreferences.toggleShowEarnings(this); showInfo(); WearTileRefresh.request(this); WearComplicationRefresh.request(this)
        }, rowParams(5))
        panel.addView(summaryAction("SYNC NOW", Color.rgb(8, 117, 209)) {
            request()
            handler.postDelayed({ if (screen == Screen.INFO) render() }, 900L)
        }, rowParams(10))
        if (!connected) panel.addView(summaryAction("OPEN PHONE", Color.rgb(76, 85, 96)) {
            WearTransport.openPhone(this)
        }, rowParams(6))
        panel.addView(settingsButton(), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(44)).apply { topMargin = dp(10) })
        val version = packageManager.getPackageInfo(packageName, 0).versionName ?: ""
        panel.addView(text(12f, Color.rgb(222, 218, 210)).apply {
            this.text = "ABOUT\nShift Tracker Wear $version\n\nSwipe left to return"
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(18) })
        presentPage(Screen.INFO, panel)
    }

    private fun showBatteryReport() {
        timer.stop(); root.keepScreenOn = false
        WearBatteryReport.sample(this)
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(28), dp(30), dp(28), dp(26))
        }
        panel.addView(summaryText("SHIFT BATTERY", 14f, Color.rgb(35, 161, 255), true))
        panel.addView(summaryText("Whole-watch usage during observed shift time", 10f, Color.LTGRAY, false), rowParams(7))
        val reports = WearBatteryReport.reports(this)
        if (reports.isEmpty()) panel.addView(summaryText(if (WearPreferences.batteryTracking(this)) "Your next shift starts a report. Open the app during your shift to record battery observations." else "Enable Battery Tracking in watch settings to start a report.", 12f, Color.WHITE, false), rowParams(12))
        reports.forEach { report ->
            val started = report.optLong("startAt"); val ended = report.optLong("lastAt")
            val date = android.text.format.DateFormat.format("dd MMM · HH:mm", java.util.Date(started)).toString()
            val label = if (report.optBoolean("finished")) date else "CURRENT · $date"
            panel.addView(summaryText(label, 11f, Color.rgb(35, 161, 255), true), rowParams(15))
            panel.addView(summaryText("${report.optInt("start")}% → ${report.optInt("last")}%", 21f, Color.WHITE, true), rowParams(5))
            val drop = WearInsightPolicy.netBatteryDrop(report.optInt("start"), report.optInt("last")) ?: 0
            panel.addView(summaryText(if (drop >= 0) "$drop percentage points used" else "${-drop} percentage points gained", 11f, Color.LTGRAY, false), rowParams(3))
            panel.addView(summaryRow("OBSERVED", WearDisplayPolicy.shiftDuration((ended - started).coerceAtLeast(0) / 1000)))
            panel.addView(summaryRow("LAST SAMPLE", recordedTime(ended)))
            panel.addView(summaryRow("DIM SETTING", report.optString("saver")))
            val charging = report.optBoolean("charging"); val gaps = report.optBoolean("gaps")
            val rate = WearInsightPolicy.netBatteryRate(report.optInt("start"), report.optInt("last"), ended - started, charging, gaps)
            if (rate != null) panel.addView(summaryText(String.format(java.util.Locale.UK, "%.1f points/hour · net change", rate), 11f, Color.WHITE, false), rowParams(5))
            if (charging) panel.addView(summaryText("Charging or battery increase detected", 10f, Color.rgb(224, 163, 56), false), rowParams(4))
            if (gaps) panel.addView(summaryText("Gaps between observations · rate unavailable", 10f, Color.LTGRAY, false), rowParams(4))
        }
        panel.addView(summaryText("Includes other watch apps. These reports do not prove savings from dim mode. Current report and last five completed reports are kept.", 10f, Color.LTGRAY, false), rowParams(14))
        panel.addView(summaryAction("BACK TO SETTINGS", Color.rgb(38, 45, 55)) { showInfo() }, rowParams(10))
        presentPage(Screen.BATTERY, panel)
    }

    private fun showMain() {
        if (screen == Screen.MAIN) return
        screen = Screen.MAIN
        activeScrollView = null
        root.removeAllViews()
        root.addView(main)
        render()
    }

    private fun showSummary() {
        root.keepScreenOn = false
        timer.stop()
        val snapshot = WearState.read(this)
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(28), dp(26), dp(28), dp(26))
        }
        panel.addView(summaryText("SHIFT SUMMARY", 12f, Color.rgb(35, 161, 255), true))
        if (snapshot == null || snapshot.disconnected || !snapshot.active) {
            panel.addView(summaryText(if (snapshot?.disconnected != false) "PHONE DISCONNECTED" else "NO ACTIVE SHIFT", 18f, Color.WHITE, true), rowParams(12))
        } else {
            panel.addView(summaryText("${snapshot.runs} runs · ${snapshot.deliveries} deliveries", 17f, Color.WHITE, true), rowParams(7))
            if (WearGoals.deliveries(this) > 0 || WearGoals.hours(this) > 0) {
                panel.addView(summaryText("SHIFT GOALS", 11f, Color.rgb(35, 161, 255), true), rowParams(10))
                val deliveryGoal = WearGoals.deliveries(this)
                if (deliveryGoal > 0) {
                    panel.addView(summaryRow("DELIVERIES", "${snapshot.deliveries}/$deliveryGoal"))
                    panel.addView(goalProgress(WearGoals.percent(snapshot.deliveries.toLong(), deliveryGoal.toLong())))
                }
                val hoursGoal = WearGoals.hours(this)
                if (hoursGoal > 0) {
                    panel.addView(summaryRow("PAID HOURS", "${WearDisplayPolicy.shiftDuration(snapshot.paidTimeSeconds)}/${hoursGoal}h"))
                    panel.addView(goalProgress(WearGoals.percent(snapshot.paidTimeSeconds, hoursGoal * 3_600L)))
                }
            }
            panel.addView(summaryRow("PAID TIME", WearDisplayPolicy.shiftDuration(snapshot.paidTimeSeconds)))
            panel.addView(summaryRow("BREAK", WearDisplayPolicy.shiftDuration(snapshot.breakTimeSeconds)))
            if (WearPreferences.showEarnings(this)) {
                panel.addView(summaryRow("WAGES", snapshot.pay.ifBlank { "—" }))
                panel.addView(summaryRow("DELIVERIES", snapshot.deliveryReimbursement.ifBlank { "—" }))
                panel.addView(summaryRow("TOTAL", snapshot.shiftTotal.ifBlank { snapshot.pay.ifBlank { "—" } }, true))
            } else panel.addView(summaryRow("EARNINGS", "HIDDEN"))
            if (snapshot.miles.isNotBlank()) panel.addView(summaryRow("MILES", snapshot.miles))
            if ("start_quick_task" in snapshot.actions || "finish_quick_tasks" in snapshot.actions) {
                panel.addView(summaryAction("QUICK TASKS", Color.rgb(8, 117, 209)) { showQuickTasks() }, rowParams(9))
            }
            if (snapshot.activity.startsWith("delivery_")) {
                panel.addView(summaryText("CURRENT DELIVERY", 11f, Color.rgb(35, 161, 255), true), rowParams(12))
                panel.addView(summaryRow("CUSTOMERS", "${snapshot.deliveredCustomers}/${snapshot.requiredCustomers}"))
                panel.addView(summaryRow("STARTED", recordedTime(snapshot.activityStarted)))
                panel.addView(summaryRow("LEFT STORE", recordedTime(snapshot.storeExitAt)))
                panel.addView(summaryRow("RETURNED", recordedTime(snapshot.storeEntryAt)))
                panel.addView(summaryRow("LEAVE TIME", WearDisplayPolicy.recordedInterval(snapshot.activityStarted, snapshot.storeExitAt)))
                panel.addView(summaryRow("TIME OUT", WearDisplayPolicy.recordedInterval(snapshot.storeExitAt, snapshot.storeEntryAt)))
                if (snapshot.earlyDispatchGapSeconds > 0) panel.addView(summaryRow("EARLY DISPATCH", WearDisplayPolicy.duration(snapshot.earlyDispatchGapSeconds.toLong())))
                if (snapshot.pausedTaskName.isNotBlank()) panel.addView(summaryText("Paused: ${snapshot.pausedTaskName}", 12f, Color.rgb(224, 163, 56), false), rowParams(6))
                panel.addView(summaryText("Recorded phone timings", 10f, Color.rgb(170, 168, 164), false), rowParams(6))
            }
            val recentRuns = WearRecentRuns.read(this)
            if (recentRuns.isNotEmpty()) {
                panel.addView(summaryText("RECENT RUNS", 11f, Color.rgb(35, 161, 255), true), rowParams(12))
                recentRuns.take(3).forEach { run ->
                    val label = if (run.activity == "delivery_double") "DOUBLE · ${run.customers} DROPS" else "SINGLE"
                    panel.addView(summaryRow(label, WearDisplayPolicy.duration(run.durationSeconds)))
                }
            }
            if ("undo_delivered" in snapshot.actions) panel.addView(summaryAction("UNDO DELIVERED", Color.rgb(76, 85, 96)) {
                confirmAction("Undo last Delivered?", "This corrects the current delivery count.", "undo_delivered")
            }, rowParams(9))
            if ("cancel_delivery" in snapshot.actions) panel.addView(summaryAction("CANCEL DELIVERY", Color.rgb(147, 43, 59)) {
                confirmAction("Cancel this delivery?", "Only use this for an accidental start.", "cancel_delivery")
            }, rowParams(7))
        }
        snapshot?.let { panel.addView(summaryText(WearDisplayPolicy.syncAgeLabel(it.updatedAt), 10f, Color.rgb(170, 168, 164), false), rowParams(10)) }
        panel.addView(summaryText("Swipe right to return", 10f, Color.rgb(170, 168, 164), false), rowParams(12))
        presentPage(Screen.SUMMARY, panel)
    }

    private fun showQuickTasks() {
        root.keepScreenOn = false
        timer.stop()
        val snapshot = WearState.read(this)
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(28), dp(26), dp(28), dp(26))
        }
        panel.addView(summaryText("QUICK TASKS", 13f, Color.rgb(35, 161, 255), true))
        if (snapshot == null || snapshot.disconnected || !snapshot.active) {
            panel.addView(summaryText("PHONE NOT READY", 17f, Color.WHITE, true), rowParams(12))
        } else {
            if ("finish_quick_tasks" in snapshot.actions) {
                panel.addView(summaryAction("FINISH CURRENT TASKS", Color.rgb(28, 157, 130)) {
                    WearTransport.sendAction(this, "finish_quick_tasks")
                    showMain()
                    resync()
                }, rowParams(10))
            }
            if ("start_quick_task" in snapshot.actions && snapshot.quickTasks.isNotEmpty()) {
                panel.addView(summaryText("Tap to start · Hold to favourite", 10f, Color.rgb(190, 187, 180), false), rowParams(10))
                val favourites = WearPreferences.favouriteTasks(this)
                WearDisplayPolicy.orderedTasks(snapshot.quickTasks, favourites).forEach { taskName ->
                    val label = (if (taskName in favourites) "★ " else "") + taskName.uppercase()
                    panel.addView(summaryAction(label, Color.rgb(38, 45, 55)) {
                        WearTransport.sendAction(this, "start_quick_task", taskName)
                        showMain()
                        resync()
                    }.apply {
                        setOnLongClickListener {
                            WearPreferences.toggleFavouriteTask(this@WearMainActivity, taskName)
                            performHapticFeedback(HapticFeedbackConstants.LONG_PRESS)
                            showQuickTasks()
                            true
                        }
                    }, rowParams(6))
                }
            } else if ("finish_quick_tasks" !in snapshot.actions) {
                panel.addView(summaryText("Finish the current activity first", 13f, Color.rgb(224, 163, 56), true), rowParams(12))
            }
        }
        panel.addView(summaryText("Swipe right to return", 10f, Color.rgb(170, 168, 164), false), rowParams(14))
        presentPage(Screen.TASKS, panel)
    }

    private fun goalProgress(percent: Int) = android.widget.ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
        max = 100; progress = percent
        progressTintList = android.content.res.ColorStateList.valueOf(if (percent >= 100) Color.rgb(70, 205, 170) else Color.rgb(35, 161, 255))
        contentDescription = "$percent percent of goal"
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(8)).apply { topMargin = dp(3); bottomMargin = dp(5) }
    }
    private fun recordedTime(timestamp: Long): String =
        if (timestamp <= 0L || timestamp > System.currentTimeMillis()) "Not recorded"
        else android.text.format.DateFormat.getTimeFormat(this).format(java.util.Date(timestamp))

    private fun summaryText(value: String, size: Float, colour: Int, bold: Boolean) = TextView(this).apply {
        text = value
        textSize = size
        setTextColor(colour)
        gravity = Gravity.CENTER
        includeFontPadding = false
        if (bold) setTypeface(typeface, Typeface.BOLD)
    }

    private fun rowParams(top: Int) = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(top) }

    private fun summaryRow(label: String, value: String, highlight: Boolean = false) = LinearLayout(this).apply {
        orientation = LinearLayout.HORIZONTAL
        gravity = Gravity.CENTER_VERTICAL
        setPadding(dp(13), dp(8), dp(13), dp(8))
        background = GradientDrawable().apply {
            cornerRadius = dp(16).toFloat()
            setColor(if (highlight) Color.rgb(17, 65, 83) else Color.rgb(28, 28, 30))
            setStroke(dp(1), if (highlight) Color.rgb(35, 161, 255) else Color.rgb(65, 65, 68))
        }
        addView(summaryText(label, 10f, Color.rgb(190, 187, 180), true), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        addView(summaryText(value, 13f, Color.WHITE, true), LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    }.also { it.layoutParams = rowParams(5) }

    private fun summaryAction(label: String, colour: Int, action: () -> Unit) = TextView(this).apply {
        text = label
        textSize = 11f
        gravity = Gravity.CENTER
        setTextColor(Color.WHITE)
        setTypeface(typeface, Typeface.BOLD)
        setPadding(dp(8), dp(11), dp(8), dp(11))
        background = GradientDrawable().apply { cornerRadius = dp(22).toFloat(); setColor(colour) }
        isClickable = true
        isFocusable = true
        setOnClickListener { action() }
    }

    private fun confirmBreak(action: String) {
        val ending = action == "end_break"
        if (breakConfirmation?.isShowing == true) return
        val original = WearState.read(this) ?: return
        handler.removeCallbacks(dimTask)
        val dialog = android.app.Dialog(this).apply { requestWindowFeature(android.view.Window.FEATURE_NO_TITLE) }
        breakConfirmation = dialog
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(28), dp(28), dp(28), dp(28))
        }
        panel.addView(ImageView(this).apply { setImageResource(R.drawable.ic_shift_tracker) },
            LinearLayout.LayoutParams(dp(24), dp(24)))
        panel.addView(summaryText(if (ending) "End break?" else "Start break?", 19f, Color.WHITE, true), rowParams(8))
        val elapsed = ((System.currentTimeMillis() - original.activityStarted) / 60_000L).coerceAtLeast(0)
        panel.addView(summaryText(if (ending) "$elapsed min on break" else "${WearGoals.breakMinutes(this)} min target", 12f, Color.rgb(224, 163, 56), true), rowParams(5))
        panel.addView(summaryText(if (ending) "Ready to get back to work?" else "Are you sure you want to start your break?", 11f, Color.LTGRAY, false), rowParams(6))
        fun choice(label: String, colour: Int, onClick: () -> Unit) = summaryAction(label, colour, onClick).apply {
            minHeight = dp(44)
            setPadding(dp(8), dp(10), dp(8), dp(10))
        }
        panel.addView(choice(if (ending) "END BREAK" else "START BREAK", Color.rgb(148, 98, 19)) {
            dialog.dismiss()
            val current = WearState.read(this)
            if (current?.active == true && !current.disconnected && (if (ending) current.activity == "break" else current.activity == original.activity) &&
                current.shiftId == original.shiftId && current.activityId == original.activityId &&
                current.activityStarted == original.activityStarted && action in current.actions) {
                WearTransport.sendAction(this, action)
                resync()
            } else { request(); render() }
        }, rowParams(12))
        panel.addView(choice(if (ending) "STAY ON BREAK" else "KEEP WORKING", Color.rgb(38, 44, 53)) { dialog.dismiss() }, rowParams(6))
        dialog.setContentView(ScrollView(this).apply { setBackgroundColor(Color.BLACK); addView(panel) })
        dialog.setOnDismissListener { breakConfirmation = null; scheduleDim() }
        dialog.show()
        dialog.window?.apply {
            setBackgroundDrawable(android.graphics.drawable.ColorDrawable(Color.BLACK))
            setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        }
    }

    private fun confirmAction(title: String, message: String, action: String) {
        AlertDialog.Builder(this)
            .setTitle(title)
            .setMessage(message)
            .setNegativeButton("Keep") { dialog, _ -> dialog.dismiss() }
            .setPositiveButton("Confirm") { _, _ ->
                WearTransport.sendAction(this, action)
                resync()
                showSummary()
            }
            .show()
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

    private fun preferenceButton(label: String, enabled: Boolean, action: () -> Unit) = TextView(this).apply {
        text = "$label   ${if (enabled) "ON" else "OFF"}"
        textSize = 10.5f
        gravity = Gravity.CENTER
        includeFontPadding = false
        setTypeface(typeface, Typeface.BOLD)
        setTextColor(Color.WHITE)
        setPadding(dp(8), dp(10), dp(8), dp(10))
        background = GradientDrawable().apply {
            cornerRadius = dp(20).toFloat()
            setColor(if (enabled) Color.rgb(17, 82, 73) else Color.rgb(42, 42, 45))
            setStroke(dp(1), if (enabled) Color.rgb(70, 205, 170) else Color.rgb(90, 90, 94))
        }
        isClickable = true
        isFocusable = true
        setOnClickListener { action() }
    }

    private fun render() {
        WearBatteryReport.sample(this)
        WearShiftOngoing.reconcile(this)
        if (dimmed || systemAmbient) {
            // Incoming phone snapshots must not wake the screen or rebuild it every second.
            return
        }
        if (screen != Screen.MAIN) {
            when (screen) {
                Screen.INFO -> showInfo()
                Screen.SUMMARY -> showSummary()
                Screen.BATTERY -> showBatteryReport()
                Screen.TASKS -> showQuickTasks()
                else -> Unit
            }
            return
        }
        val snapshot = WearState.read(this)
        val feedback = WearState.readActionFeedback(this)?.takeIf { it.visible }
        val pending = feedback?.pending == true
        handler.removeCallbacks(feedbackRefresh)
        if (feedback != null && feedback.visible) {
            val duration = if (pending) WearReliabilityPolicy.ACTION_PENDING_TIMEOUT_MS else WearReliabilityPolicy.ACTION_RESULT_VISIBLE_MS
            handler.postDelayed(feedbackRefresh, (feedback.updatedAt + duration - System.currentTimeMillis() + 50L).coerceAtLeast(50L))
        }
        actions.removeAllViews()
        contextDetail.text = ""
        actionStatus.text = feedback?.let(::feedbackText).orEmpty()
        actionStatus.setTextColor(if (feedback?.outcome in setOf("stale_state", "invalid_action", "error", "not_connected", "send_failed")) Color.rgb(239, 105, 90) else Color.rgb(105, 205, 180))
        feedback?.outcome?.takeIf { it != lastFeedbackOutcome && it !in setOf("sending", "queued") }?.let { outcome ->
            lastFeedbackOutcome = outcome
            root.performHapticFeedback(if (outcome in setOf("applied", "already_applied")) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.REJECT)
        }

        timer.textSize = 32f
        timerLabel.visibility = View.GONE
        timer.setOnChronometerTickListener(null)
        dial.breakFraction = null
        dial.contentDescription = null
        state.textSize = 15f
        if (snapshot == null || snapshot.disconnected) {
            root.keepScreenOn = false
            dial.accent = Color.rgb(224, 163, 56)
            dial.progress = .15f
            state.setTextColor(Color.rgb(224, 163, 56))
            state.text = "WAITING FOR PHONE"
            state.textSize = 13f
            timer.stop()
            timer.textSize = 19f
            timer.text = "Let’s reconnect"
            detail.text = WearDisplayPolicy.syncAgeLabel(snapshot?.updatedAt ?: 0L) +
                if (snapshot?.active == true) "\nLast: ${WearDisplayPolicy.activityTitle(snapshot.activity).lowercase().replaceFirstChar { it.uppercase() }}" else ""
            contextDetail.text = "Move closer to your phone.\nIf nearby, open the phone app."
            actionStatus.text = "Controls return after syncing"
            actionStatus.setTextColor(Color.LTGRAY)
            actions.addView(TextView(this).apply {
                text = "RETRY SYNC"; textSize = 11f; gravity = Gravity.CENTER
                setTextColor(Color.WHITE); setTypeface(typeface, Typeface.BOLD)
                background = GradientDrawable().apply { cornerRadius = dp(30).toFloat(); setColor(Color.rgb(8, 117, 209)) }
                isClickable = true; isFocusable = true
                setOnClickListener {
                    text = "CHECKING…"
                    request()
                    handler.postDelayed({ render() }, 1_800L)
                }
            })
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
            contextDetail.text = ""
            actions.addView(openPhoneButton())
            actions.requestLayout()
            return
        }

        root.keepScreenOn = WearPreferences.keepAwake(this) && !WearPreferences.batterySaverDisplay(this)
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
        state.textSize = 15f
        state.setTypeface(state.typeface, Typeface.BOLD)
        state.text = WearDisplayPolicy.activityTitle(snapshot.activity)
        val useShiftTimer = WearPreferences.mainTimer(this) == "shift"
        if (useShiftTimer && snapshot.activity != "break") {
            timerLabel.text = "SHIFT ELAPSED"
            timerLabel.visibility = View.VISIBLE
        }
        val start = if (snapshot.activity == "idle" || useShiftTimer) snapshot.shiftStarted else snapshot.activityStarted
        val now = System.currentTimeMillis()
        timer.base = if (start in 1..now + 60_000L) SystemClock.elapsedRealtime() - (now - start).coerceAtLeast(0L) else SystemClock.elapsedRealtime()
        timer.setOnChronometerTickListener(null)
        timer.isCountDown = false
        val breakDue = WearBreakReminder.due(this, snapshot)
        if (breakDue != null) {
            val targetMs = WearGoals.breakMinutes(this) * 60_000L
            fun updateBreak(at: Long) {
                val over = at >= breakDue
                timer.text = WearInsightPolicy.breakClock(snapshot.activityStarted, targetMs, at)
                state.text = if (over) "BREAK TARGET MET" else "BREAK"
                val breakColour = if (over) Color.rgb(239, 105, 90) else Color.rgb(224, 163, 56)
                state.setTextColor(breakColour); dial.accent = breakColour
                dial.breakFraction = if (WearPreferences.breakRing(this)) WearInsightPolicy.breakProgress(snapshot.activityStarted, targetMs, at) else null
                dial.contentDescription = if (over) "Break target reached" else "Break target ${(WearInsightPolicy.breakProgress(snapshot.activityStarted, targetMs, at) * 100).toInt()} percent elapsed"
            }
            timer.base = SystemClock.elapsedRealtime() - (now - snapshot.activityStarted).coerceAtLeast(0L)
            timer.setOnChronometerTickListener { updateBreak(System.currentTimeMillis()) }
            updateBreak(now)
        }
        timer.start()
        val where = when (snapshot.storeStatus) {
            "at_store" -> "AT STORE"
            "outside_store" -> "OUTSIDE STORE"
            "detecting" -> "DETECTING GPS"
            else -> ""
        }
        val customerProgress = if (delivery && snapshot.requiredCustomers > 0) {
            "CUSTOMER ${snapshot.deliveredCustomers.coerceAtMost(snapshot.requiredCustomers)}/${snapshot.requiredCustomers}"
        } else ""
        val earnings = if (WearPreferences.showEarnings(this)) " • ${snapshot.pay}" else ""
        val selectedStat = when (WearPreferences.mainStat(this)) {
            "deliveries" -> "${snapshot.deliveries} deliveries"
            "earnings" -> if (WearPreferences.showEarnings(this)) snapshot.pay else "Earnings hidden"
            "mileage" -> "${snapshot.miles.ifBlank { "—" }} mi"
            "delivery_goal" -> if (WearGoals.deliveries(this) > 0) "${snapshot.deliveries}/${WearGoals.deliveries(this)} deliveries" else "Delivery goal off"
            "paid_goal" -> if (WearGoals.hours(this) > 0) "Paid ${WearDisplayPolicy.shiftDuration(snapshot.paidTimeSeconds)} / ${WearGoals.hours(this)}h" else "Paid hours goal off"
            "none" -> ""
            else -> "${snapshot.deliveries} deliveries$earnings"
        }
        val activityDetail = if (customerProgress.isNotBlank()) customerProgress else if (!delivery && snapshot.activity !in setOf("idle", "break")) snapshot.name else ""
        detail.text = listOf(selectedStat, activityDetail).filter { it.isNotBlank() }.joinToString("\n")
        contextDetail.text = if (snapshot.activity == "break") "${WearGoals.breakMinutes(this)} MIN TARGET · END MANUALLY" else WearDisplayPolicy.contextLine(snapshot, where)

        val deliveredLabel = if (snapshot.requiredCustomers > 1) {
            "DELIVERED ${(snapshot.deliveredCustomers + 1).coerceAtMost(snapshot.requiredCustomers)}/${snapshot.requiredCustomers}"
        } else "DELIVERED"

        val resumeChoice = "resume_task" in snapshot.actions || "dismiss_resume" in snapshot.actions
        val availableActions = if (resumeChoice) listOf(
            "resume_task" to "RESUME",
            "dismiss_resume" to "LEAVE PAUSED",
        ) else listOf(
            "delivered" to deliveredLabel,
            "back_at_store" to "BACK AT STORE",
            "end_break" to "END BREAK",
            "finish_quick_tasks" to "FINISH TASKS",
            "complete_task" to "COMPLETE",
            "single" to "SINGLE",
            "double" to "DOUBLE",
            "break" to "BREAK",
        )
        availableActions.filter { it.first in snapshot.actions }.forEach { (action, label) ->
            actions.addView(actionButton(label, action, when {
                action == "single" || action == "delivered" && snapshot.activity == "delivery_single" -> Color.rgb(239, 29, 69)
                action == "double" || action == "delivered" -> Color.rgb(8, 117, 209)
                action == "break" || action == "end_break" -> Color.rgb(224, 163, 56)
                action == "finish_quick_tasks" -> Color.rgb(28, 157, 130)
                action == "dismiss_resume" -> Color.rgb(76, 85, 96)
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

    private fun actionButton(label: String, action: String, colour: Int, pending: Boolean) = TextView(this).apply {
        text = label
        textSize = if (label.length > 11) 9f else 10.5f
        gravity = Gravity.CENTER
        includeFontPadding = false
        setTypeface(typeface, Typeface.BOLD)
        isClickable = true
        isFocusable = true
        setPadding(dp(4), 0, dp(4), 0)
        setTextColor(Color.WHITE)
        isEnabled = !pending
        alpha = if (pending) .55f else 1f
        background = GradientDrawable().apply {
            cornerRadius = dp(30).toFloat()
            setColor(colour)
            setStroke(dp(1), Color.argb(100, 255, 255, 255))
        }
        elevation = 0f
        setOnClickListener {
            if (action == "end_break" || action == "break") {
                confirmBreak(action)
                return@setOnClickListener
            }
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
            setStroke(dp(1), Color.argb(100, 255, 255, 255))
        }
        elevation = 0f
        setOnClickListener {
            detail.text = "Opening Shift Tracker on phone…"
            WearTransport.openPhone(this@WearMainActivity)
        }
    }

    private fun request() = WearTransport.requestState(this)

    private fun resync() {
        listOf(600L, 1_800L, 4_000L, 8_000L, 15_000L, 20_100L).forEach { delay -> handler.postDelayed({ request(); render() }, delay) }
    }

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density).toInt().coerceAtLeast(1)
}
