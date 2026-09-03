package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.*
import android.provider.Settings
import android.view.*
import android.widget.*
import com.google.android.gms.wearable.*

class WearMainActivity : Activity(), DataClient.OnDataChangedListener {
    private lateinit var root:FrameLayout; private lateinit var main:FrameLayout; private lateinit var dial:WearDialView; private lateinit var state:TextView; private lateinit var timer:Chronometer; private lateinit var detail:TextView; private lateinit var actions:ArcActionLayout
    private var showingInfo=false
    private val handler=Handler(Looper.getMainLooper())
    override fun onCreate(b:Bundle?){super.onCreate(b); window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON); if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS),226); build(); request(); render()}
    override fun onResume(){super.onResume();Wearable.getDataClient(this).addListener(this);if(hasReadyWearUpdate(this))startActivity(Intent(this,WearUpdateActivity::class.java));request();render()}
    override fun onPause(){Wearable.getDataClient(this).removeListener(this);handler.removeCallbacksAndMessages(null);super.onPause()}
    override fun onDataChanged(es:DataEventBuffer){es.use{it.forEach{e->if(e.dataItem.uri.path==WearState.STATE_PATH){if(e.type==DataEvent.TYPE_DELETED)WearState.clear(this);runOnUiThread{render()}}}}}
    private fun build(){root=FrameLayout(this).apply{setBackgroundColor(Color.BLACK);keepScreenOn=true};main=FrameLayout(this);root.addView(main);dial=WearDialView(this);main.addView(dial,FrameLayout.LayoutParams(-1,-1));val panel=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER_HORIZONTAL;setPadding(34,22,34,108)}
        fun tx(sz:Float,c:Int)=TextView(this).apply{textSize=sz;setTextColor(c);gravity=Gravity.CENTER;includeFontPadding=false}
        panel.addView(ImageView(this).apply{setImageResource(site.chatgpt.traynor1987.dominosshifttracker.wear.R.drawable.ic_shift_tracker);contentDescription="Shift Tracker"},LinearLayout.LayoutParams(23,23).apply{bottomMargin=2})
        panel.addView(tx(11f,Color.rgb(35,161,255)).apply{text="SHIFT TRACKER"});state=tx(19f,Color.WHITE);panel.addView(state);timer=Chronometer(this).apply{textSize=37f;setTextColor(Color.WHITE);gravity=Gravity.CENTER};panel.addView(timer);detail=tx(12f,Color.rgb(222,218,210));panel.addView(detail);main.addView(panel,FrameLayout.LayoutParams(-1,-1));actions=ArcActionLayout(this);main.addView(actions,FrameLayout.LayoutParams(-1,-1));
        var touchX=0f;var touchY=0f
        root.setOnTouchListener{_,e->
            when(e.actionMasked){
                MotionEvent.ACTION_DOWN->{touchX=e.x;touchY=e.y}
                MotionEvent.ACTION_UP->{val horizontal=e.x-touchX;val vertical=e.y-touchY;if(kotlin.math.abs(horizontal)>90&&kotlin.math.abs(horizontal)>kotlin.math.abs(vertical)*1.3f){if(horizontal>0)showInfo()else showMain()}}
            }
            false
        };setContentView(root)}
    private fun showInfo(){
        if(showingInfo)return
        showingInfo=true;timer.stop();root.removeAllViews()
        val panel=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER_HORIZONTAL;setPadding(34,42,34,34)}
        fun tx(sz:Float,c:Int)=TextView(this).apply{textSize=sz;setTextColor(c);gravity=Gravity.CENTER;includeFontPadding=false}
        val connected=WearState.read(this)?.disconnected==false
        val status=if(connected)"PHONE CONNECTED" else "PHONE NOT CONNECTED"
        val hint=if(connected)"● Live shift data available" else "● Open phone app to reconnect"
        panel.addView(tx(12f,Color.rgb(35,161,255)).apply{text="SHIFT TRACKER"})
        panel.addView(tx(21f,Color.WHITE).apply{text=status})
        panel.addView(tx(12f,if(connected)Color.rgb(70,205,170) else Color.rgb(239,105,90)).apply{text=hint},LinearLayout.LayoutParams(-1,-2).apply{topMargin=8;bottomMargin=26})
        panel.addView(settingsButton(),LinearLayout.LayoutParams(-1,48))
        val version=packageManager.getPackageInfo(packageName,0).versionName?:""
        panel.addView(tx(12f,Color.rgb(222,218,210)).apply{text="ABOUT\nShift Tracker Wear $version\n\nSwipe left to return"},LinearLayout.LayoutParams(-1,-2).apply{topMargin=22})
        root.addView(panel,FrameLayout.LayoutParams(-1,-1))
    }
    private fun showMain(){if(!showingInfo)return;showingInfo=false;root.removeAllViews();root.addView(main);render()}
    private fun settingsButton()=Button(this).apply{text="APP SETTINGS";textSize=13f;isAllCaps=false;setTextColor(Color.WHITE);background=GradientDrawable().apply{cornerRadius=38f;setColor(Color.rgb(8,117,209));setStroke(2,Color.rgb(120,190,255))};setOnClickListener{startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:$packageName")))}}
    private fun render(){if(showingInfo){showInfo();return};val s=WearState.read(this);actions.removeAllViews();if(s==null||s.disconnected){dial.accent=Color.rgb(224,163,56);dial.progress=.15f;state.text="PHONE DISCONNECTED";timer.stop();timer.text="LAST STATE";detail.text="Open phone to reconnect";return};if(!s.active){dial.accent=Color.rgb(8,117,209);dial.progress=.22f;state.text="CLOCKED OUT";timer.stop();timer.text="OFF";detail.text="Open phone to start a shift";actions.addView(openPhoneButton());actions.requestLayout();return}
        val delivery=s.activity.startsWith("delivery_");val c=if(s.activity=="delivery_single")Color.rgb(239,29,69)else if(s.activity=="delivery_double")Color.rgb(8,117,209)else if(s.activity=="break")Color.rgb(224,163,56)else Color.rgb(28,157,130);dial.accent=c;dial.progress=if(delivery).72f else .5f;state.setTextColor(c);state.text=when(s.activity){"delivery_single"->"SINGLE DELIVERY";"delivery_double"->"DOUBLE DELIVERY";"break"->"BREAK";"cleaning"->"CLEANING";"prep"->"PREP";"task"->"TASK";else->"AT STORE"};val start=if(s.activity=="idle")s.shiftStarted else s.activityStarted;timer.base=SystemClock.elapsedRealtime()-(System.currentTimeMillis()-start);timer.start();val where=when(s.storeStatus){"at_store"->"AT STORE";"outside_store"->"OUTSIDE STORE";"detecting"->"DETECTING GPS";else->""};detail.text="${s.deliveries} deliveries • ${s.pay}${if(s.name.isNotBlank())"\n${s.name}"else""}${if(where.isNotBlank())" • $where"else""}"
        listOf("delivered" to "DELIVERED","back_at_store" to "RETURN","end_break" to "END BREAK","complete_task" to "COMPLETE","single" to "SINGLE","double" to "DOUBLE","break" to "BREAK").filter{it.first in s.actions}.forEach{(a,l)->actions.addView(button(l,a,when{a=="single"||a=="delivered"&&s.activity=="delivery_single"->Color.rgb(239,29,69);a=="double"||a=="delivered"->Color.rgb(8,117,209);a=="break"||a=="end_break"->Color.rgb(224,163,56);else->Color.rgb(28,157,130)}))};actions.requestLayout()}
    private fun button(l:String,a:String,c:Int)=Button(this).apply{text=l;textSize=11f;gravity=Gravity.CENTER;includeFontPadding=false;isAllCaps=false;setPadding(4,0,4,0);setTextColor(Color.WHITE);background=GradientDrawable().apply{cornerRadius=30f;setColor(c);setStroke(2,Color.argb(210,255,255,255))};elevation=5f;setOnClickListener{isEnabled=false;state.text="$l…";WearTransport.sendAction(this@WearMainActivity,a);resync()}}
    private fun openPhoneButton()=Button(this).apply{text="OPEN ON PHONE";textSize=11f;gravity=Gravity.CENTER;includeFontPadding=false;isAllCaps=false;setPadding(4,0,4,0);setTextColor(Color.WHITE);background=GradientDrawable().apply{cornerRadius=30f;setColor(Color.rgb(8,117,209));setStroke(2,Color.argb(210,255,255,255))};elevation=5f;setOnClickListener{isEnabled=false;detail.text="Opening Shift Tracker on phone…";WearTransport.openPhone(this@WearMainActivity)}}
    private fun request(){WearTransport.requestState(this)}
    private fun resync(){var n=0;val r=object:Runnable{override fun run(){request();if(++n<10)handler.postDelayed(this,700)}};handler.post(r)}
}
