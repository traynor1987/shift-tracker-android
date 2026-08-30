package site.chatgpt.traynor1987.dominosshifttracker

import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

class ShiftTrackerTileService : TileService() {
    override fun onStartListening() {
        super.onStartListening()
        val snapshot = NativeShiftState.read(this)
        qsTile?.apply {
            state = if (snapshot?.shiftActive == true && !snapshot.isStale) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
            label = when (snapshot?.activity) {
                "delivery_single" -> "Delivery"
                "delivery_double" -> "Double delivery"
                "break" -> "Break"
                "cleaning" -> "Cleaning"
                "prep" -> "Prep"
                else -> "Shift Tracker"
            }
            if (Build.VERSION.SDK_INT >= 29) subtitle = if (snapshot?.shiftActive == true && !snapshot.isStale) "ON" else "OFF"
            updateTile()
        }
    }

    override fun onClick() {
        super.onClick()
        val intent = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        if (Build.VERSION.SDK_INT >= 34) startActivityAndCollapse(android.app.PendingIntent.getActivity(this, 3900, intent, android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE))
        else @Suppress("DEPRECATION") startActivityAndCollapse(intent)
    }
}
