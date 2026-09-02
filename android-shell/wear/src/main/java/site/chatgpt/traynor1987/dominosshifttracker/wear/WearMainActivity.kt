package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.app.Activity
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.*
import android.view.*
import android.widget.*
import com.google.android.gms.wearable.*

class WearMainActivity : Activity(), DataClient.OnDataChangedListener {
    private lateinit var dial:WearDialView; private lateinit var state:TextView; private lateinit var timer:Chronometer; private lateinit var detail:TextView; private lateinit var actions:ArcActionLayout
    private val handler=Handler(Looper.getMainLooper())
    override fun onCreate(b:Bundle?){super.onCreate(b); window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); build(); request(); render()}
    override fun onResume(){super.onResume();Wearable.getDataClient(this).addListener(this);request();render()}
    override fun onPause(){Wearable.getDataClient(this).removeListener(this);handler.removeCallbacksAndMessages(null);super.onPause()}
    override fun onDataChanged(es:DataEventBuffer){es.use{it.forEach{e->if(e.dataItem.uri.path==WearState.STATE_PATH){if(e.type==DataEvent.TYPE_DELETED)WearState.clear(this);runOnUiThread{render()}}}}}
    private fun build(){val root=FrameLayout(this).apply{setBackgroundColor(Color.BLACK);keepScreenOn=true};dial=WearDialView(this);root.addView(dial,FrameLayout.LayoutParams(-1,-1));val panel=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER_HORIZONTAL;setPadding(34,22,34,108)}
        fun tx(sz:Float,c:Int)=TextView(this).apply{textSize=sz;setTextColor(c);gravity=Gravity.CENTER;includeFontPadding=false}
        panel.addView(ImageView(this).apply{setImageResource(site.chatgpt.traynor1987.dominosshifttracker.wear.R.drawable.ic_shift_tracker);contentDescription="Shift Tracker"},LinearLayout.LayoutParams(23,23).apply{bottomMargin=2})
        panel.addView(tx(11f,Color.rgb(35,161,255)).apply{text="SHIFT TRACKER"});state=tx(19f,Color.WHITE);panel.addView(state);timer=Chronometer(this).apply{textSize=37f;setTextColor(Color.WHITE);gravity=Gravity.CENTER};panel.addView(timer);detail=tx(12f,Color.rgb(222,218,210));panel.addView(detail);root.addView(panel,FrameLayout.LayoutParams(-1,-1));actions=ArcActionLayout(this);root.addView(actions,FrameLayout.LayoutParams(-1,-1));setContentView(root)}
    private fun render(){val s=WearState.read(this);actions.removeAllViews();if(s==null||s.disconnected){dial.accent=Color.rgb(224,163,56);dial.progress=.15f;state.text="PHONE DISCONNECTED";timer.stop();timer.text="LAST STATE";detail.text="Open phone to reconnect";return};if(!s.active){dial.accent=Color.rgb(8,117,209);dial.progress=.22f;state.text="CLOCKED OUT";timer.stop();timer.text="OFF";detail.text="Open phone to start a shift";return}
        val delivery=s.activity.startsWith("delivery_");val c=if(s.activity=="delivery_single")Color.rgb(239,29,69)else if(s.activity=="delivery_double")Color.rgb(8,117,209)else if(s.activity=="break")Color.rgb(224,163,56)else Color.rgb(28,157,130);dial.accent=c;dial.progress=if(delivery).72f else .5f;state.setTextColor(c);state.text=when(s.activity){"delivery_single"->"SINGLE DELIVERY";"delivery_double"->"DOUBLE DELIVERY";"break"->"BREAK";"cleaning"->"CLEANING";"prep"->"PREP";"task"->"TASK";else->"AT STORE"};val start=if(s.activity=="idle")s.shiftStarted else s.activityStarted;timer.base=SystemClock.elapsedRealtime()-(System.currentTimeMillis()-start);timer.start();val where=when(s.storeStatus){"at_store"->"AT STORE";"outside_store"->"OUTSIDE STORE";"detecting"->"DETECTING GPS";else->""};detail.text="${s.deliveries} deliveries • ${s.pay}${if(s.name.isNotBlank())"\n${s.name}"else""}${if(where.isNotBlank())" • $where"else""}"
        listOf("delivered" to "DELIVERED","back_at_store" to "RETURN","end_break" to "END BREAK","complete_task" to "COMPLETE","single" to "SINGLE","double" to "DOUBLE","break" to "BREAK").filter{it.first in s.actions}.forEach{(a,l)->actions.addView(button(l,a,when{a=="single"||a=="delivered"&&s.activity=="delivery_single"->Color.rgb(239,29,69);a=="double"||a=="delivered"->Color.rgb(8,117,209);a=="break"||a=="end_break"->Color.rgb(224,163,56);else->Color.rgb(28,157,130)}))};actions.requestLayout()}
    private fun button(l:String,a:String,c:Int)=Button(this).apply{text=l;textSize=11f;gravity=Gravity.CENTER;includeFontPadding=false;isAllCaps=false;setPadding(4,0,4,0);setTextColor(Color.WHITE);background=GradientDrawable().apply{cornerRadius=30f;setColor(c);setStroke(2,Color.argb(210,255,255,255))};elevation=5f;setOnClickListener{isEnabled=false;state.text="$l…";WearTransport.sendAction(this@WearMainActivity,a);resync()}}
    private fun request(){WearTransport.requestState(this)}
    private fun resync(){var n=0;val r=object:Runnable{override fun run(){request();if(++n<10)handler.postDelayed(this,700)}};handler.post(r)}
}
