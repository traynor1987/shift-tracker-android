package site.chatgpt.traynor1987.dominosshifttracker

import android.content.Context
import android.content.Intent
import org.json.JSONObject
import java.time.Instant

/** Optional, explicit and signature-protected factual hand-off. Shift Tracker
 * stays fully independent when James OS is absent. */
object JamesOsWorkBridge {
    private const val ACTION="uk.co.james.action.SHIFT_TRACKER_WORK_EVENT"
    private const val EXTRA="uk.co.james.extra.SHIFT_TRACKER_WORK_PAYLOAD"
    private const val PERMISSION="uk.co.james.permission.SHIFT_TRACKER_WORK_CONTEXT"
    private const val TARGET="uk.co.james"
    fun publish(context:Context, previous:ShiftSnapshot?, current:ShiftSnapshot) {
        if(current.shiftId.isBlank()) return
        val type=when { previous?.shiftActive!=true&&current.shiftActive -> "SHIFT_STARTED"; previous?.shiftActive==true&&!current.shiftActive -> "SHIFT_ENDED"; else -> return }
        val occurred=if(type=="SHIFT_STARTED") current.shiftStartedAt else System.currentTimeMillis()
        val eventId="${current.shiftId}:${type}:${occurred}"
        val payload=JSONObject().put("contractVersion",2).put("eventId",eventId).put("shiftId",current.shiftId).put("eventType",type).put("occurredAt",Instant.ofEpochMilli(occurred).toString()).put("revision",current.stateRevision.hashCode().toLong().and(0x7fffffffL)).toString()
        runCatching { context.sendBroadcast(Intent(ACTION).setPackage(TARGET).putExtra(EXTRA,payload),PERMISSION) }
    }
}
