package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.NoDataComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceService
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.ComplicationRequestListener

class ShiftTrackerComplicationService : ComplicationDataSourceService() {
    override fun onComplicationRequest(request: ComplicationRequest, listener: ComplicationRequestListener) {
        listener.onComplicationData(complication(request.complicationType, WearState.read(this)))
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? = complication(type, null)

    private fun complication(type: ComplicationType, snapshot: WearSnapshot?): ComplicationData {
        val short = when {
            snapshot == null -> "SHIFT"
            snapshot.disconnected -> "SYNC"
            !snapshot.active -> "OFF"
            snapshot.activity == "delivery_single" -> "SINGLE"
            snapshot.activity == "delivery_double" -> "DOUBLE"
            snapshot.activity == "break" -> "BREAK"
            snapshot.activity == "idle" -> "STORE"
            else -> "TASK"
        }
        val title = when {
            snapshot == null -> "Shift Tracker"
            snapshot.disconnected -> "Open phone"
            !snapshot.active -> "Clocked out"
            snapshot.activity.startsWith("delivery_") && snapshot.requiredCustomers > 0 ->
                "${snapshot.deliveredCustomers}/${snapshot.requiredCustomers} delivered"
            else -> "${snapshot.deliveries} deliveries"
        }
        val long = when {
            snapshot == null -> "Open Shift Tracker"
            snapshot.disconnected -> "Phone disconnected"
            !snapshot.active -> "Shift Tracker · Clocked out"
            WearPreferences.showEarnings(this) -> "$short · ${snapshot.deliveries} deliveries · ${snapshot.pay}"
            else -> "$short · ${snapshot.deliveries} deliveries"
        }
        val description = PlainComplicationText.Builder("Shift Tracker: $long").build()
        return when (type) {
            ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(
                PlainComplicationText.Builder(short).build(), description,
            ).setTitle(PlainComplicationText.Builder(title).build()).setTapAction(openApp()).build()
            ComplicationType.LONG_TEXT -> LongTextComplicationData.Builder(
                PlainComplicationText.Builder(long).build(), description,
            ).setTitle(PlainComplicationText.Builder(title).build()).setTapAction(openApp()).build()
            else -> NoDataComplicationData()
        }
    }

    private fun openApp(): PendingIntent = PendingIntent.getActivity(
        this,
        7100,
        Intent(this, WearMainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
}

object WearComplicationRefresh {
    fun request(context: Context) {
        ComplicationDataSourceUpdateRequester.create(
            context,
            ComponentName(context, ShiftTrackerComplicationService::class.java),
        ).requestUpdateAll()
    }
}
