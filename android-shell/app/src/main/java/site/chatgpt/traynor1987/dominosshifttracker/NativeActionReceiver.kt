package site.chatgpt.traynor1987.dominosshifttracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class NativeActionReceiver : BroadcastReceiver() {
    companion object {
        const val ACTION_RUN = "site.chatgpt.traynor1987.dominosshifttracker.RUN_EXISTING_ACTION"
        const val ACTION_RUN_ACTIVITY = "site.chatgpt.traynor1987.dominosshifttracker.RUN_EXISTING_ACTION_ACTIVITY"
        const val EXTRA_ACTION = "native_action"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.getStringExtra(EXTRA_ACTION) ?: "open"
        NativeShiftState.queueAction(context, action)
        context.startActivity(Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
    }
}
