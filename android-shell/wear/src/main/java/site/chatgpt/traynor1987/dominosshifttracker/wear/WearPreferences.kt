package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.content.Context

object WearPreferences {
    private const val PREFS = "shift_tracker_wear_preferences_v1"
    private const val HAPTIC_GEOFENCE = "haptic_geofence"
    private const val KEEP_AWAKE = "keep_awake"
    private const val SHOW_EARNINGS = "show_earnings"

    fun hapticGeofence(context: Context): Boolean = prefs(context).getBoolean(HAPTIC_GEOFENCE, true)
    fun keepAwake(context: Context): Boolean = prefs(context).getBoolean(KEEP_AWAKE, true)
    fun showEarnings(context: Context): Boolean = prefs(context).getBoolean(SHOW_EARNINGS, true)

    fun toggleHapticGeofence(context: Context): Boolean = toggle(context, HAPTIC_GEOFENCE, true)
    fun toggleKeepAwake(context: Context): Boolean = toggle(context, KEEP_AWAKE, true)
    fun toggleShowEarnings(context: Context): Boolean = toggle(context, SHOW_EARNINGS, true)

    fun favouriteTasks(context: Context): Set<String> =
        prefs(context).getStringSet("favourite_tasks", emptySet())?.toSet().orEmpty()

    fun toggleFavouriteTask(context: Context, name: String) {
        val names = favouriteTasks(context).toMutableSet()
        if (!names.remove(name)) names.add(name)
        prefs(context).edit().putStringSet("favourite_tasks", names).apply()
    }

    fun batterySaverDisplay(context: Context): Boolean = prefs(context).getBoolean("battery_saver_display", true)
    fun toggleBatterySaverDisplay(context: Context): Boolean = toggle(context, "battery_saver_display", true)
    fun dimDelay(context: Context): Long = prefs(context).getLong("dim_delay", 15_000L).takeIf { it in listOf(15_000L, 30_000L, 60_000L) } ?: 15_000L
    fun cycleDimDelay(context: Context) {
        val next = when (dimDelay(context)) { 15_000L -> 30_000L; 30_000L -> 60_000L; else -> 15_000L }
        WearSettingsSync.change(context, "dim_delay", next.toString())
    }

    val mainStats = linkedMapOf("deliveries_earnings" to "Deliveries + earnings", "deliveries" to "Deliveries", "earnings" to "Earnings", "mileage" to "Mileage", "delivery_goal" to "Delivery goal", "paid_goal" to "Paid hours goal", "none" to "None")
    fun holdActions(c: Context) = prefs(c).getBoolean("hold_actions", false)
    fun toggleHoldActions(c: Context) = toggle(c, "hold_actions", false)
    fun mainTimer(c: Context) = prefs(c).getString("main_timer", "activity") ?: "activity"
    fun mainStat(c: Context) = prefs(c).getString("main_stat", "deliveries_earnings") ?: "deliveries_earnings"
    fun breakRing(c: Context) = prefs(c).getBoolean("break_ring", true)
    fun batteryTracking(c: Context) = prefs(c).getBoolean("battery_tracking", true)
    fun cycleMainTimer(c: Context) = WearSettingsSync.change(c, "main_timer", if (mainTimer(c) == "shift") "activity" else "shift")
    fun cycleMainStat(c: Context) {
        val choices = mainStats.keys.toList()
        WearSettingsSync.change(c, "main_stat", choices[(choices.indexOf(mainStat(c)) + 1) % choices.size])
    }
    fun toggleBreakRing(c: Context) = toggle(c, "break_ring", true)
    fun toggleBatteryTracking(c: Context) = toggle(c, "battery_tracking", true)

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private fun toggle(context: Context, key: String, default: Boolean): Boolean {
        val next = !prefs(context).getBoolean(key, default)
        WearSettingsSync.change(context, key, next.toString())
        return next
    }
}
