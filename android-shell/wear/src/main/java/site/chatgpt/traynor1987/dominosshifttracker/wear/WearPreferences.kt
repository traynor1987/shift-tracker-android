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

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private fun toggle(context: Context, key: String, default: Boolean): Boolean {
        val next = !prefs(context).getBoolean(key, default)
        prefs(context).edit().putBoolean(key, next).apply()
        return next
    }
}
