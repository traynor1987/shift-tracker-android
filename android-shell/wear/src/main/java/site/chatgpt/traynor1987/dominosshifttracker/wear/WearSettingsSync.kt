package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.content.Context
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import site.chatgpt.traynor1987.dominosshifttracker.settings.WearSettingsStore

object WearSettingsSync {
    fun store(context: Context) = WearSettingsStore(context.applicationContext, "watch", { values ->
        val display = context.getSharedPreferences("shift_tracker_wear_preferences_v1", Context.MODE_PRIVATE).edit()
        listOf("keep_awake", "battery_saver_display", "show_earnings", "haptic_geofence", "break_ring", "battery_tracking", "hold_actions").forEach { key -> values[key]?.let { display.putBoolean(key, it.toBooleanStrict()) } }
        values["dim_delay"]?.let { display.putLong("dim_delay", it.toLong()) }
        listOf("main_timer", "main_stat").forEach { key -> values[key]?.let { display.putString(key, it) } }
        display.apply()
        val goals = context.getSharedPreferences("wear_goals_v1", Context.MODE_PRIVATE).edit()
        values["break_alert"]?.let { goals.putBoolean("break_alert", it.toBooleanStrict()) }
        listOf("break_minutes", "deliveries", "hours").forEach { key -> values[key]?.let { goals.putInt(key, it.toInt()) } }
        goals.apply()
        WearBatteryReport.sample(context)
        WearBreakReminder.reconcile(context)
        WearShiftOngoing.reconcile(context)
        WearTileRefresh.request(context)
        WearComplicationRefresh.request(context)
    }, {})
    fun initialize(context: Context) {
        store(context).initializeWatch(mapOf(
            "hold_actions" to WearPreferences.holdActions(context).toString(),
            "main_timer" to WearPreferences.mainTimer(context),
            "main_stat" to WearPreferences.mainStat(context),
            "break_ring" to WearPreferences.breakRing(context).toString(),
            "battery_tracking" to WearPreferences.batteryTracking(context).toString(),
            "keep_awake" to WearPreferences.keepAwake(context).toString(),
            "battery_saver_display" to WearPreferences.batterySaverDisplay(context).toString(),
            "show_earnings" to WearPreferences.showEarnings(context).toString(),
            "haptic_geofence" to WearPreferences.hapticGeofence(context).toString(),
            "dim_delay" to WearPreferences.dimDelay(context).toString(),
            "break_alert" to WearGoals.breakAlert(context).toString(),
            "break_minutes" to WearGoals.breakMinutes(context).toString(),
            "deliveries" to WearGoals.deliveries(context).toString(),
            "hours" to WearGoals.hours(context).toString()))
    }
    fun change(context: Context, key: String, value: String) {
        initialize(context)
        store(context).edit(key, value)
    }
}
class WearSettingsListenerService : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) {
        WearSettingsSync.initialize(this)
        WearSettingsSync.store(this).onData(events)
    }
    override fun onMessageReceived(event: MessageEvent) {
        if (event.path == WearSettingsStore.REQUEST) {
            WearSettingsSync.initialize(this)
            WearSettingsSync.store(this).publish()
        }
    }
}
