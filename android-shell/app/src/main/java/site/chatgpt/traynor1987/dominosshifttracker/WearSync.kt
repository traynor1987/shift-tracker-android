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

    fun publish(context: Context, snapshot: ShiftSnapshot = NativeShiftState.read(context) ?: return) {
        val raw = JSONObject()
            .put("shiftActive", snapshot.shiftActive)
            .put("shiftStartedAtEpochMs", snapshot.shiftStartedAt)
            .put("activity", snapshot.activity)
            .put("activityName", snapshot.activityName)
            .put("activityStartedAtEpochMs", snapshot.activityStartedAt)
            .put("deliveries", snapshot.deliveries)
            .put("estimatedPay", snapshot.estimatedPay)
            .put("storeStatus", snapshot.storeStatus)
            .put("allowedActions", snapshot.allowedActions.joinToString(","))
            .put("updatedAtEpochMs", snapshot.updatedAt)
            .toString()
        val request = PutDataMapRequest.create(STATE_PATH).apply {
            dataMap.putString(KEY_JSON, raw)
            dataMap.putLong("sentAt", System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()
        Wearable.getDataClient(context.applicationContext).putDataItem(request)
    }

    fun clear(context: Context) {
        Wearable.getDataClient(context.applicationContext).deleteDataItems(android.net.Uri.parse("wear://*/$STATE_PATH"))
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
