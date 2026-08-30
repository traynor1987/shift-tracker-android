package site.chatgpt.traynor1987.dominosshifttracker

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.widget.RemoteViews

private fun activityTitle(snapshot: ShiftSnapshot?): String = when (snapshot?.activity) {
    "delivery_single" -> "DELIVERY"
    "delivery_double" -> "DOUBLE DELIVERY"
    "break" -> "BREAK"
    "cleaning" -> "CLEANING"
    "prep" -> "PREP"
    "task" -> "TASK"
    else -> if (snapshot?.shiftActive == true) "CLOCKED IN" else "CLOCKED OUT"
}

private fun activityDetail(snapshot: ShiftSnapshot?): String = when {
    snapshot == null || !snapshot.shiftActive -> "Tap to open Shift Tracker"
    snapshot.activityName.isNotBlank() -> snapshot.activityName
    snapshot.activity == "delivery_single" -> "Single"
    snapshot.activity == "delivery_double" -> "2 deliveries"
    else -> "At Store"
}

private fun RemoteViews.bindChronometer(snapshot: ShiftSnapshot?, viewId: Int, startedAt: Long) {
    if (snapshot?.shiftActive == true && startedAt > 0L) {
        setViewVisibility(viewId, android.view.View.VISIBLE)
        setChronometer(viewId, android.os.SystemClock.elapsedRealtime() - (System.currentTimeMillis() - startedAt), null, true)
    } else setViewVisibility(viewId, android.view.View.GONE)
}

/** A widget's main timer always belongs to the currently active activity.
 * Idle is the only state that should show the full shift duration. */
private fun timerStartedAt(snapshot: ShiftSnapshot?): Long = when {
    snapshot?.shiftActive != true -> 0L
    snapshot.activity == "idle" -> snapshot.shiftStartedAt
    else -> snapshot.activityStartedAt
}

private val widgetActionOrder = listOf("delivered", "back_at_store", "end_break", "complete_task", "single", "double", "break")

private fun actionLabel(action: String): String = when (action) {
    "delivered" -> "DELIVERED"
    "back_at_store" -> "BACK AT STORE"
    "end_break" -> "END BREAK"
    "complete_task" -> "COMPLETE"
    "single" -> "SINGLE"
    "double" -> "DOUBLE"
    "break" -> "BREAK"
    else -> "OPEN"
}

private fun actionBackground(snapshot: ShiftSnapshot?, action: String): Int = when (action) {
    "single" -> R.drawable.widget_red_button
    "delivered" -> if (snapshot?.activity == "delivery_single") R.drawable.widget_red_button else R.drawable.widget_blue_button
    "back_at_store", "end_break", "complete_task" -> R.drawable.widget_green_button
    else -> R.drawable.widget_blue_button
}

private fun bindDynamicAction(view: RemoteViews, context: Context, snapshot: ShiftSnapshot?, viewId: Int, action: String?, requestCode: Int) {
    if (action == null) {
        view.setViewVisibility(viewId, android.view.View.GONE)
        return
    }
    view.setViewVisibility(viewId, android.view.View.VISIBLE)
    view.setTextViewText(viewId, actionLabel(action))
    view.setInt(viewId, "setBackgroundResource", actionBackground(snapshot, action))
    view.setOnClickPendingIntent(viewId, if (action == "open") NativeShiftState.openAppPendingIntent(context, requestCode) else NativeShiftState.actionPendingIntent(context, action, requestCode))
}

class CompactShiftWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = update(context, manager, ids, NativeShiftState.read(context))

    companion object {
        fun update(context: Context, manager: AppWidgetManager, ids: IntArray, snapshot: ShiftSnapshot?) {
            ids.forEach { id ->
                val view = RemoteViews(context.packageName, R.layout.widget_shift_compact)
                view.setTextViewText(R.id.compact_status, activityTitle(snapshot))
                view.setTextViewText(R.id.compact_detail, activityDetail(snapshot))
                view.bindChronometer(snapshot, R.id.compact_timer, timerStartedAt(snapshot))
                view.setOnClickPendingIntent(R.id.compact_root, NativeShiftState.openAppPendingIntent(context, 3200 + id))
                manager.updateAppWidget(id, view)
            }
        }
    }
}

class SmallShiftWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = update(context, manager, ids, NativeShiftState.read(context))

    companion object {
        fun update(context: Context, manager: AppWidgetManager, ids: IntArray, snapshot: ShiftSnapshot?) {
            ids.forEach { id ->
                val view = RemoteViews(context.packageName, R.layout.widget_shift_small)
                view.setTextViewText(R.id.widget_status, activityTitle(snapshot))
                view.setTextViewText(R.id.widget_detail, activityDetail(snapshot))
                view.bindChronometer(snapshot, R.id.widget_timer, timerStartedAt(snapshot))
                view.setOnClickPendingIntent(R.id.widget_root, NativeShiftState.openAppPendingIntent(context, 3300 + id))
                manager.updateAppWidget(id, view)
            }
        }
    }
}

class MediumShiftWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = update(context, manager, ids, NativeShiftState.read(context))

    companion object {
        fun update(context: Context, manager: AppWidgetManager, ids: IntArray, snapshot: ShiftSnapshot?) {
            ids.forEach { id ->
                val view = RemoteViews(context.packageName, R.layout.widget_shift_medium)
                view.setTextViewText(R.id.widget_status, activityTitle(snapshot))
                view.setTextViewText(R.id.widget_detail, activityDetail(snapshot))
                view.setTextViewText(R.id.widget_deliveries, "${snapshot?.deliveries ?: 0} deliveries")
                view.setTextViewText(R.id.widget_pay, snapshot?.estimatedPay?.ifBlank { "Pay calculating" } ?: "Clock in to begin")
                view.bindChronometer(snapshot, R.id.widget_timer, timerStartedAt(snapshot))
                view.setOnClickPendingIntent(R.id.widget_root, NativeShiftState.openAppPendingIntent(context, 3400 + id))
                val actions = snapshot?.takeIf { it.shiftActive && !it.isStale }?.let { state ->
                    widgetActionOrder.filter { action -> action in state.allowedActions }.take(3)
                } ?: emptyList()
                bindDynamicAction(view, context, snapshot, R.id.widget_single, actions.getOrNull(0), 3500 + id)
                bindDynamicAction(view, context, snapshot, R.id.widget_double, actions.getOrNull(1), 3600 + id)
                bindDynamicAction(view, context, snapshot, R.id.widget_break, actions.getOrNull(2), 3700 + id)
                bindDynamicAction(view, context, snapshot, R.id.widget_open, "open", 3800 + id)
                manager.updateAppWidget(id, view)
            }
        }
    }
}

class LargeShiftWidget : AppWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) = update(context, manager, ids, NativeShiftState.read(context))

    companion object {
        fun update(context: Context, manager: AppWidgetManager, ids: IntArray, snapshot: ShiftSnapshot?) {
            ids.forEach { id ->
                val view = RemoteViews(context.packageName, R.layout.widget_shift_large)
                view.setTextViewText(R.id.large_status, activityTitle(snapshot))
                view.setTextViewText(R.id.large_detail, activityDetail(snapshot))
                view.setTextViewText(R.id.large_deliveries, "${snapshot?.deliveries ?: 0} deliveries")
                view.setTextViewText(R.id.large_pay, snapshot?.estimatedPay?.ifBlank { "Pay calculating" } ?: "Clock in to begin")
                view.bindChronometer(snapshot, R.id.large_timer, timerStartedAt(snapshot))
                view.setOnClickPendingIntent(R.id.large_root, NativeShiftState.openAppPendingIntent(context, 4300 + id))
                val actions = snapshot?.takeIf { it.shiftActive && !it.isStale }?.let { state ->
                    widgetActionOrder.filter { action -> action in state.allowedActions }.take(3)
                } ?: emptyList()
                bindDynamicAction(view, context, snapshot, R.id.large_action_one, actions.getOrNull(0), 4400 + id)
                bindDynamicAction(view, context, snapshot, R.id.large_action_two, actions.getOrNull(1), 4500 + id)
                bindDynamicAction(view, context, snapshot, R.id.large_action_three, actions.getOrNull(2), 4600 + id)
                bindDynamicAction(view, context, snapshot, R.id.large_open, "open", 4700 + id)
                manager.updateAppWidget(id, view)
            }
        }
    }
}
