package site.chatgpt.traynor1987.dominosshifttracker

import android.content.Context
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import site.chatgpt.traynor1987.dominosshifttracker.settings.WearSettingsStore

object PhoneWearSettings {
    fun store(context: Context) = WearSettingsStore(context.applicationContext, "phone", {}, { sendStatus(context) })
    fun sendStatus(context: Context) { MainActivity.sendNativeMessage(store(context).status()) }
    fun refresh(context: Context) { sendStatus(context); store(context).refresh() }
    fun edit(context: Context, key: String, value: String) { store(context).edit(key, value); sendStatus(context) }
}
class PhoneWearSettingsListenerService : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) { PhoneWearSettings.store(this).onData(events) }
    override fun onMessageReceived(event: MessageEvent) {
        if (event.path == WearSettingsStore.REQUEST) PhoneWearSettings.store(this).publish()
    }
}
