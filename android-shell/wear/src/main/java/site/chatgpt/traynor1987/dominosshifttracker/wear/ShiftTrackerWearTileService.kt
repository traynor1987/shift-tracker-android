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
        val action = clicked?.removePrefix("action_")
        if (action != null && state != null && !state.disconnected && action in state.actions) WearTransport.sendAction(this, action)
        val label = when {
            state == null || state.disconnected -> "PHONE DISCONNECTED"
            !state.active -> "CLOCKED OUT"
            state.activity == "delivery_single" -> "SINGLE DELIVERY"
            state.activity == "delivery_double" -> "DOUBLE DELIVERY"
            state.activity == "break" -> "BREAK"
            state.activity == "cleaning" -> "CLEANING"
            state.activity == "prep" -> "PREP"
            state.activity == "task" -> "TASK"
            else -> "AT STORE"
        }
        val detail = state?.let { "${it.deliveries} deliveries • ${it.pay}" } ?: "Open phone to reconnect"
        val root = Column.Builder().addContent(Text.Builder().setText("SHIFT TRACKER").build()).addContent(Text.Builder().setText(label).build()).addContent(Text.Builder().setText(detail).build())
        state?.actions?.firstOrNull { it in setOf("delivered", "back_at_store", "end_break", "complete_task", "single", "double", "break") }?.let { safeAction ->
            root.addContent(Text.Builder().setText(safeAction.replace('_', ' ').uppercase()).setModifiers(ModifiersBuilders.Modifiers.Builder().setClickable(ModifiersBuilders.Clickable.Builder().setId("action_$safeAction").setOnClick(ActionBuilders.LoadAction.Builder().build()).build()).build()).build())
        }
        root.addContent(Text.Builder().setText("OPEN APP FOR MORE").build())
        val builtRoot = root.build()
        val layout = Layout.Builder().setRoot(builtRoot).build()
        val timeline = TimelineBuilders.Timeline.Builder().addTimelineEntry(TimelineBuilders.TimelineEntry.Builder().setLayout(layout).build()).build()
        return immediate(TileBuilders.Tile.Builder().setResourcesVersion("1").setTileTimeline(timeline).setFreshnessIntervalMillis(15 * 60_000L).build())
    }
    override fun onTileResourcesRequest(requestParams: RequestBuilders.ResourcesRequest): ListenableFuture<ResourceBuilders.Resources> = immediate(ResourceBuilders.Resources.Builder().setVersion("1").build())

    private fun <T> immediate(value: T): ListenableFuture<T> = CallbackToFutureAdapter.getFuture { completer -> completer.set(value); "shift-tracker-tile" }
}

object WearTileRefresh { fun request(context: android.content.Context) { TileService.getUpdater(context).requestUpdate(ShiftTrackerWearTileService::class.java) } }
