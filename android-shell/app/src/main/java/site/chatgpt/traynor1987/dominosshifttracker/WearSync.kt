package site.chatgpt.traynor1987.dominosshifttracker

import android.content.Context
import android.content.Intent
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.DataMap
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/** Sends only the existing non-authoritative native mirror to Wear OS. No location collection occurs here. */
object WearSync {
    const val STATE_PATH = "/shift-tracker/state"
    const val ACTION_PATH = "/shift-tracker/action"
    const val REQUEST_PATH = "/shift-tracker/request-state"
    const val RESULT_PATH = "/shift-tracker/action-result"
    private const val KEY_JSON = "snapshot"

    /** A positive clocked-out reply replaces any last cached live watch state. */
    private fun inactiveSnapshot() = ShiftSnapshot(
        shiftActive = false,
        shiftStartedAt = 0L,
        activity = "idle",
        activityName = "",
        activityStartedAt = 0L,
        deliveries = 0,
        estimatedPay = "",
        storeStatus = "unknown",
        allowedActions = emptySet(),
        updatedAt = System.currentTimeMillis(),
        settings = NativeFeatureSettings(),
    )

    fun publish(context: Context, snapshot: ShiftSnapshot? = null) {
        // A watch request after clock-out must overwrite its previous live
        // state. Returning without a DataItem left the last timer running.
        val current = snapshot ?: NativeShiftState.read(context) ?: inactiveSnapshot()
        val raw = JSONObject()
            .put("shiftActive", current.shiftActive)
            .put("shiftStartedAtEpochMs", current.shiftStartedAt)
            .put("activity", current.activity)
            .put("activityName", current.activityName)
            .put("activityStartedAtEpochMs", current.activityStartedAt)
            .put("deliveries", current.deliveries)
            .put("estimatedPay", current.estimatedPay)
            .put("storeStatus", current.storeStatus)
            .put("allowedActions", current.allowedActions.joinToString(","))
            .put("updatedAtEpochMs", current.updatedAt)
            .toString()
        val request = PutDataMapRequest.create(STATE_PATH).apply {
            dataMap.putString(KEY_JSON, raw)
            dataMap.putLong("sentAt", System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()
        Wearable.getDataClient(context.applicationContext).putDataItem(request)
    }

    fun clear(context: Context) {
        // Publish an explicit inactive state rather than only deleting the
        // item: deletion is not guaranteed to reach a temporarily disconnected
        // watch, while this payload safely replaces any stale cached snapshot.
        publish(context, inactiveSnapshot())
    }

    fun reply(context: Context, nodeId: String, accepted: Boolean) {
        Wearable.getMessageClient(context).sendMessage(nodeId, RESULT_PATH, if (accepted) "accepted".toByteArray() else "rejected".toByteArray())
    }
}

/** Receives a request from the watch then starts the existing phone/WebView action path. */
class PhoneWearListenerService : WearableListenerService() {
    override fun onMessageReceived(event: MessageEvent) {
        when (event.path) {
            WearSync.REQUEST_PATH -> WearSync.publish(this)
            WearSync.ACTION_PATH -> {
                val action = event.data.toString(Charsets.UTF_8)
                val accepted = NativeShiftState.queueRemoteAction(this, action)
                if (accepted) startActivity(Intent(this, MainActivity::class.java)
                    .setAction(NativeActionReceiver.ACTION_RUN_ACTIVITY)
                    .putExtra(NativeActionReceiver.EXTRA_ACTION, action)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
                WearSync.reply(this, event.sourceNodeId, accepted)
            }
        }
    }
}
