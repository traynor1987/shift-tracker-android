package site.chatgpt.traynor1987.dominosshifttracker.wear

import androidx.wear.protolayout.LayoutElementBuilders.Column
import androidx.wear.protolayout.LayoutElementBuilders.Layout
import androidx.wear.protolayout.LayoutElementBuilders.Text
import androidx.wear.protolayout.ActionBuilders
import androidx.wear.protolayout.ModifiersBuilders
import androidx.wear.protolayout.ResourceBuilders
import androidx.wear.protolayout.TimelineBuilders
import androidx.wear.tiles.RequestBuilders
import androidx.wear.tiles.TileBuilders
import androidx.wear.tiles.TileService
import androidx.concurrent.futures.CallbackToFutureAdapter
import com.google.common.util.concurrent.ListenableFuture

/** Battery-conscious Tile: it renders the mirrored snapshot and opens the full watch app for controls. */
class ShiftTrackerWearTileService : TileService() {
    override fun onTileRequest(requestParams: RequestBuilders.TileRequest): ListenableFuture<TileBuilders.Tile> {
        val state = WearState.read(this)
        val clicked = requestParams.currentState.lastClickableId
        val action = setOf("delivered", "back_at_store", "end_break", "complete_task", "single", "double", "break", "resume_task", "finish_quick_tasks")
            .firstOrNull { candidate -> clicked?.endsWith("_$candidate") == true }
        if (clicked?.startsWith("action_") == true && action != null && state != null && !state.disconnected && action in state.actions && consumeClick(clicked)) WearTransport.sendAction(this, action)
        val label = when {
            state == null || state.disconnected -> "PHONE DISCONNECTED"
            !state.active -> "CLOCKED OUT"
            else -> WearDisplayPolicy.activityTitle(state.activity)
        }
        val detail = state?.let {
            val progress = if (it.activity.startsWith("delivery_") && it.requiredCustomers > 0) " · ${it.deliveredCustomers}/${it.requiredCustomers}" else ""
            val earnings = if (WearPreferences.showEarnings(this)) " · ${it.pay} wages" else ""
            "${it.deliveries} deliveries$progress$earnings"
        } ?: "Open phone to reconnect"
        val extra = state?.let {
            when {
                it.pausedTaskName.isNotBlank() -> "Paused: ${it.pausedTaskName}"
                WearPreferences.showEarnings(this) && it.deliveryReimbursement.isNotBlank() -> "Delivery pay ${it.deliveryReimbursement}"
                else -> WearDisplayPolicy.syncAgeLabel(it.updatedAt)
            }
        }.orEmpty()
        val root = Column.Builder().addContent(Text.Builder().setText("SHIFT TRACKER").build()).addContent(Text.Builder().setText(label).build()).addContent(Text.Builder().setText(detail).build())
        if (extra.isNotBlank()) root.addContent(Text.Builder().setText(extra).build())
        val safeActions = if (state?.actions?.contains("resume_task") == true) listOf("resume_task") else state?.actions?.filter { it in setOf("delivered", "back_at_store", "end_break", "complete_task", "single", "double", "break", "finish_quick_tasks") }?.take(2).orEmpty()
        safeActions.forEach { safeAction ->
            val actionId = "action_${state?.stateRevision.orEmpty().hashCode()}_$safeAction"
            val actionLabel = when (safeAction) {
                "resume_task" -> "RESUME TASK"
                "back_at_store" -> "BACK AT STORE"
                "end_break" -> "END BREAK"
                "complete_task" -> "COMPLETE"
                "finish_quick_tasks" -> "FINISH TASKS"
                else -> safeAction.replace('_', ' ').uppercase()
            }
            root.addContent(Text.Builder().setText(actionLabel).setModifiers(ModifiersBuilders.Modifiers.Builder().setClickable(ModifiersBuilders.Clickable.Builder().setId(actionId).setOnClick(ActionBuilders.LoadAction.Builder().build()).build()).build()).build())
        }
        val launch = ActionBuilders.LaunchAction.Builder().setAndroidActivity(ActionBuilders.AndroidActivity.Builder().setPackageName(packageName).setClassName(WearMainActivity::class.java.name).build()).build()
        root.addContent(Text.Builder().setText("OPEN APP").setModifiers(ModifiersBuilders.Modifiers.Builder().setClickable(ModifiersBuilders.Clickable.Builder().setId("open_app").setOnClick(launch).build()).build()).build())
        val builtRoot = root.build()
        val layout = Layout.Builder().setRoot(builtRoot).build()
        val timeline = TimelineBuilders.Timeline.Builder().addTimelineEntry(TimelineBuilders.TimelineEntry.Builder().setLayout(layout).build()).build()
        return immediate(TileBuilders.Tile.Builder().setResourcesVersion("1").setTileTimeline(timeline).setFreshnessIntervalMillis(15 * 60_000L).build())
    }
    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> = immediate(ResourceBuilders.Resources.Builder().setVersion("1").build())

    private fun <T> immediate(value: T): ListenableFuture<T> = CallbackToFutureAdapter.getFuture { completer -> completer.set(value); "shift-tracker-tile" }

    private fun consumeClick(id: String): Boolean {
        val prefs = getSharedPreferences("shift_tracker_tile", MODE_PRIVATE)
        val now = System.currentTimeMillis()
        val duplicate = prefs.getString("last_id", null) == id && now - prefs.getLong("last_at", 0L) < 5_000L
        if (!duplicate) prefs.edit().putString("last_id", id).putLong("last_at", now).apply()
        return !duplicate
    }
}

object WearTileRefresh { fun request(context: android.content.Context) { TileService.getUpdater(context).requestUpdate(ShiftTrackerWearTileService::class.java) } }
