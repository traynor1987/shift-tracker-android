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

private fun bindDynamicAction(view: RemoteViews, context: Context, snapshot: ShiftSnapshot?, viewId: Int, action: String?, requestCode: Int) {
    if (action == null) {
        view.setViewVisibility(viewId, android.view.View.GONE)
        return
    }
    view.setViewVisibility(viewId, android.view.View.VISIBLE)
    view.setTextViewText(viewId, actionLabel(action))
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
                view.bindChronometer(snapshot, R.id.compact_timer, if (snapshot?.activity != "idle") snapshot?.activityStartedAt ?: 0L else snapshot?.shiftStartedAt ?: 0L)
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
                view.bindChronometer(snapshot, R.id.widget_timer, if (snapshot?.activity != "idle") snapshot?.activityStartedAt ?: 0L else snapshot?.shiftStartedAt ?: 0L)
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
                view.bindChronometer(snapshot, R.id.widget_timer, snapshot?.shiftStartedAt ?: 0L)
                view.setOnClickPendingIntent(R.id.widget_root, NativeShiftState.openAppPendingIntent(context, 3400 + id))
                bindAction(view, context, snapshot, R.id.widget_single, "single", 3500 + id)
                bindAction(view, context, snapshot, R.id.widget_double, "double", 3600 + id)
                bindAction(view, context, snapshot, R.id.widget_break, "break", 3700 + id)
                view.setOnClickPendingIntent(R.id.widget_open, NativeShiftState.openAppPendingIntent(context, 3800 + id))
                manager.updateAppWidget(id, view)
            }
        }

        private fun bindAction(view: RemoteViews, context: Context, snapshot: ShiftSnapshot?, viewId: Int, action: String, requestCode: Int) {
            val enabled = snapshot?.shiftActive == true && !snapshot.isStale && action in snapshot.allowedActions
            view.setViewVisibility(viewId, if (enabled) android.view.View.VISIBLE else android.view.View.GONE)
            if (enabled) view.setOnClickPendingIntent(viewId, NativeShiftState.actionPendingIntent(context, action, requestCode))
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
                view.bindChronometer(snapshot, R.id.large_timer, snapshot?.shiftStartedAt ?: 0L)
                view.setOnClickPendingIntent(R.id.large_root, NativeShiftState.openAppPendingIntent(context, 4300 + id))
                val actions = (snapshot?.takeIf { it.shiftActive && !it.isStale }?.let { state ->
                    widgetActionOrder.filter { action -> action in state.allowedActions }.take(3)
                } ?: emptyList()) + "open"
                bindDynamicAction(view, context, snapshot, R.id.large_action_one, actions.getOrNull(0), 4400 + id)
                bindDynamicAction(view, context, snapshot, R.id.large_action_two, actions.getOrNull(1), 4500 + id)
                bindDynamicAction(view, context, snapshot, R.id.large_action_three, actions.getOrNull(2), 4600 + id)
                bindDynamicAction(view, context, snapshot, R.id.large_open, actions.getOrNull(3), 4700 + id)
                manager.updateAppWidget(id, view)
            }
        }
    }
}
