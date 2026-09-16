package site.chatgpt.traynor1987.dominosshifttracker

import android.content.Context
import android.content.Intent
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

/** Optional, signature-protected factual hand-off.  The bounded local ledger
 * permits idempotent replay after James OS has been unavailable. */
object JamesOsWorkBridge {
    const val ACTION="uk.co.james.action.SHIFT_TRACKER_WORK_EVENT"
    const val EXTRA="uk.co.james.extra.SHIFT_TRACKER_WORK_PAYLOAD"
    const val PERMISSION="uk.co.james.permission.SHIFT_TRACKER_WORK_CONTEXT"
    /** James OS's stable Android application ID, not its Kotlin namespace. */
    private const val TARGET="uk.co.james.personal"
    private const val PREFS="james_os_work_bridge_v2"
    private const val LEDGER="events"
    private const val MAX_EVENTS=96
    internal fun targetPackage()=TARGET
    fun publish(context:Context, previous:ShiftSnapshot?, current:ShiftSnapshot) {
        if(current.shiftId.isBlank()) return
        when { previous?.shiftActive!=true&&current.shiftActive -> emit(context,current,"SHIFT_STARTED",current.shiftStartedAt); previous?.shiftActive==true&&!current.shiftActive -> emit(context,current,"SHIFT_ENDED",current.updatedAt) }
        if(!current.shiftActive) return
        if(previous?.activity!=current.activity || previous?.activityId!=current.activityId) {
            previous?.takeIf {it.shiftActive}?.let {ended->endType(ended.activity)?.let {emit(context,ended,it,current.activityStartedAt.takeIf {time->time>0}?:current.updatedAt)}}
            startType(current.activity)?.let {emit(context,current,it,current.activityStartedAt.takeIf {time->time>0}?:current.updatedAt)}
        }
    }
    /** A source-side deletion retracts normal production evidence.  The
     * tombstone is retained in the replay ledger so a later James OS restart
     * cannot silently resurrect the deleted shift. */
    fun retract(context:Context,shiftId:String,revision:Long,retractedAt:Long):Boolean {
        val payload=runCatching {retractionPayload(shiftId,revision,retractedAt)}.getOrNull()?:return false
        remember(context,payload);send(context,payload);return true
    }
    internal fun retractionPayload(shiftId:String,revision:Long,retractedAt:Long):String {
        require(shiftId.isNotBlank()&&shiftId.length<=128)
        require(revision in 0..1_000_000L)
        require(retractedAt>0)
        // Keep the tombstone builder JVM-testable. org.json is an Android
        // runtime API, while this is also the deterministic contract we replay.
        return "{\"contractVersion\":2,\"eventId\":${jsonString("$shiftId:SHIFT_RETRACTED")},\"shiftId\":${jsonString(shiftId)},\"eventType\":\"SHIFT_RETRACTED\",\"occurredAt\":${jsonString(Instant.ofEpochMilli(retractedAt).toString())},\"revision\":$revision,\"deleted\":true}"
    }
    private fun jsonString(value:String):String = buildString(value.length + 2) {
        append('"')
        value.forEach { character -> when (character) {
            '\\' -> append("\\\\")
            '"' -> append("\\\"")
            '\n' -> append("\\n")
            '\r' -> append("\\r")
            '\t' -> append("\\t")
            else -> append(character)
        } }
        append('"')
    }
    private fun startType(activity:String)=when(activity) {"break"->"BREAK_STARTED";"delivery_single","delivery_double"->"DELIVERY_STARTED";"cleaning","prep","task"->"TASK_STARTED";else->null}
    private fun endType(activity:String)=when(activity) {"break"->"BREAK_ENDED";"delivery_single","delivery_double"->"RETURNED_TO_STORE";"cleaning","prep","task"->"TASK_ENDED";else->null}
    private fun emit(context:Context,snapshot:ShiftSnapshot,type:String,at:Long) {
        val occurred=at.takeIf {it>0}?:System.currentTimeMillis();val eventId="${snapshot.shiftId}:$type:${snapshot.activityId.ifBlank {"shift"}}:$occurred"
        val payload=JSONObject().put("contractVersion",2).put("eventId",eventId).put("shiftId",snapshot.shiftId).put("eventType",type).put("occurredAt",Instant.ofEpochMilli(occurred).toString()).put("revision",snapshot.stateRevision.hashCode().toLong().and(0x7fffffffL)).apply {
            if(type.startsWith("DELIVERY")||type=="RETURNED_TO_STORE") {put("deliveryId",snapshot.activityId);put("deliveryType",if(snapshot.activity=="delivery_double")"DOUBLE" else "SINGLE")}
            if(type.startsWith("BREAK"))put("breakId",snapshot.activityId)
            if(type.startsWith("TASK")){put("taskId",snapshot.activityId);put("taskType",snapshot.activity)}
        }.toString();remember(context,payload);send(context,payload)
    }
    private fun send(context:Context,payload:String)=runCatching {context.sendBroadcast(Intent(ACTION).setPackage(TARGET).putExtra(EXTRA,payload),PERMISSION)}
    private fun remember(context:Context,payload:String) {val prefs=context.getSharedPreferences(PREFS,Context.MODE_PRIVATE);val old=runCatching {JSONArray(prefs.getString(LEDGER,"[]"))}.getOrDefault(JSONArray());val incoming=JSONObject(payload);val id=incoming.optString("eventId");val revision=incoming.optLong("revision",-1);val next=JSONArray();var replaced=false;for(i in 0 until old.length()){val value=old.optString(i);if(value.isBlank())continue;val existing=runCatching {JSONObject(value)}.getOrNull()?:continue;if(existing.optString("eventId")!=id)next.put(value)else {if(existing.optLong("revision",-1)<revision)next.put(payload)else next.put(value);replaced=true}};if(!replaced)next.put(payload);val compact=JSONArray();for(i in maxOf(0,next.length()-MAX_EVENTS) until next.length())compact.put(next.optString(i));prefs.edit().putString(LEDGER,compact.toString()).apply()}
    fun replay(context:Context) {val values=runCatching {JSONArray(context.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getString(LEDGER,"[]"))}.getOrDefault(JSONArray());for(i in 0 until values.length())values.optString(i).takeIf {it.isNotBlank()}?.let {send(context,it)}}
    /** Receives only rota fields the web tracker already knows.  Reminder-only
     * rows are intentionally ignored: a notification time is not a shift. */
    fun publishRota(context:Context,rows:JSONArray) {
        val entries=JSONArray();for(i in 0 until minOf(rows.length(),128)){val row=rows.optJSONObject(i)?:continue;val id=row.optString("id").trim();val shift=row.optString("shiftId").trim();val start=row.optLong("startEpochMs");val end=row.optLong("endEpochMs");if(id.isBlank()||shift.isBlank()||start<=0||end<=start)continue;entries.put(JSONObject().put("rotaId",id).put("shiftId",shift).put("start",Instant.ofEpochMilli(start).toString()).put("end",Instant.ofEpochMilli(end).toString()).put("revision",row.optLong("revision",0)).put("deleted",row.optBoolean("deleted",false)).put("preparationMinutes",row.optLong("preparationMinutes",0).coerceIn(0,240)))}
        if(entries.length()==0)return
        val payload=JSONObject().put("contractVersion",2).put("entries",entries).toString()
        runCatching {context.sendBroadcast(Intent("uk.co.james.action.SHIFT_TRACKER_ROTA").setPackage(TARGET).putExtra(EXTRA,payload),PERMISSION)}
    }
}
