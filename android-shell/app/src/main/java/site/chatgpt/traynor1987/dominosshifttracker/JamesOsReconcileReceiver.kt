package site.chatgpt.traynor1987.dominosshifttracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class JamesOsReconcileReceiver:BroadcastReceiver() {
    override fun onReceive(context:Context,intent:Intent) {
        if(intent.action=="uk.co.james.action.SHIFT_TRACKER_RECONCILE") JamesOsWorkBridge.replay(context)
    }
}
