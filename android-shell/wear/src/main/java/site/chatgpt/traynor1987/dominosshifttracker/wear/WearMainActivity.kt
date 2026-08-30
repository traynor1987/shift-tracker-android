package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.os.SystemClock
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.Chronometer
import android.widget.LinearLayout
import android.widget.TextView
import com.google.android.gms.wearable.Wearable

class WearMainActivity : Activity() {
    private lateinit var title: TextView; private lateinit var state: TextView; private lateinit var timer: Chronometer; private lateinit var detail: TextView; private lateinit var controls: LinearLayout
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); build(); requestState(); render() }
    override fun onResume() { super.onResume(); requestState(); render() }
    private fun build() {
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL; setPadding(20, 18, 20, 18); setBackgroundColor(Color.rgb(20,18,17)) }
        fun text(size: Float, color: Int) = TextView(this).apply { textSize = size; setTextColor(color); gravity = Gravity.CENTER; setPadding(0,4,0,4) }
        title=text(14f, Color.rgb(8,117,209)); state=text(24f, Color.rgb(255,253,248)); timer=Chronometer(this).apply { textSize=34f; setTextColor(Color.WHITE); gravity=Gravity.CENTER; setPadding(0,8,0,4) }; detail=text(14f, Color.rgb(220,215,207)); controls=LinearLayout(this).apply { orientation=LinearLayout.HORIZONTAL; gravity=Gravity.CENTER; setPadding(0,8,0,0) }
        root.addView(title); root.addView(state); root.addView(timer); root.addView(detail); root.addView(controls); setContentView(root)
    }
    private fun render() { val s=WearState.read(this); title.text="SHIFT TRACKER"; controls.removeAllViews()
        if (s == null || s.disconnected) { state.text="PHONE DISCONNECTED"; timer.stop(); timer.text="LAST STATE"; detail.text="Open the phone to reconnect"; return }
        if (!s.active) { state.text="CLOCKED OUT"; timer.stop(); timer.text="OFF"; detail.text="Open phone to start a shift"; add("OPEN", "open", Color.rgb(8,117,209)); return }
        val delivery=s.activity == "delivery_single" || s.activity == "delivery_double"; state.text=when(s.activity) { "delivery_single"->"SINGLE"; "delivery_double"->"DOUBLE"; "break"->"BREAK"; "cleaning"->"CLEANING"; "prep"->"PREP"; "task"->"TASK"; else->"AT STORE" }; state.setTextColor(if(s.activity=="delivery_single") Color.rgb(229,35,62) else if(s.activity=="delivery_double") Color.rgb(8,117,209) else Color.rgb(255,253,248))
        val start=if(delivery || s.activity!="idle") s.activityStarted else s.shiftStarted; timer.base=SystemClock.elapsedRealtime()-(System.currentTimeMillis()-start); timer.start(); val store=when(s.storeStatus){"at_store"->"AT STORE";"outside_store"->"OUTSIDE STORE";"detecting"->"DETECTING GPS";else->""}; detail.text="${s.deliveries} deliveries • ${s.pay}${if(s.name.isNotBlank()) "\n${s.name}" else ""}${if(store.isNotBlank()) "\n$store" else ""}"
        val order= listOf("delivered" to "DELIVERED", "back_at_store" to "BACK", "end_break" to "END", "complete_task" to "COMPLETE", "single" to "SINGLE", "double" to "DOUBLE", "break" to "BREAK")
        order.filter { it.first in s.actions }.take(2).forEach { (action,label)->add(label, action, if(action=="single"||action=="delivered"&&s.activity=="delivery_single") Color.rgb(229,35,62) else if(action=="double"||action=="delivered") Color.rgb(8,117,209) else Color.rgb(31,139,119)) }
    }
    private fun add(label: String, action: String, color:Int) { controls.addView(Button(this).apply { text=label; textSize=11f; setTextColor(Color.WHITE); setBackgroundColor(color); setOnClickListener { isEnabled=false; send(action) } }, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { setMargins(3,0,3,0) }) }
    private fun requestState() { WearTransport.requestState(this) }
    private fun send(action:String) { WearTransport.sendAction(this, action); WearTileRefresh.request(this) }
}
