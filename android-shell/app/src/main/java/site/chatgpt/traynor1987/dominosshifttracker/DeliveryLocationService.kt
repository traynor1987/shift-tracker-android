package site.chatgpt.traynor1987.dominosshifttracker

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.content.SharedPreferences
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import org.json.JSONObject

/**
 * Native GPS provider for one active delivery. It never calculates route
 * analytics and never writes PWA data; it only journals provider samples and
 * forwards them through MainActivity's exact-origin bridge when available.
 */
class DeliveryLocationService : Service() {
    companion object {
        const val ACTION_START = "site.chatgpt.traynor1987.dominosshifttracker.START_LOCATION"
        const val ACTION_STOP = "site.chatgpt.traynor1987.dominosshifttracker.STOP_LOCATION"
        const val EXTRA_DELIVERY_ID = "delivery_id"
        private const val NOTIFICATION_CHANNEL_ID = "shift_tracker_delivery_gps"
        private const val NOTIFICATION_ID = 2101
        private const val PREFS_NAME = "native_delivery_tracking"
        private const val PREF_DELIVERY_ID = "delivery_id"

        @Volatile
        private var running = false

        @Volatile
        private var diagnostic = "SERVICE_NOT_STARTED"

        @Volatile
        private var lastSampleReceivedAt: Long? = null

        @Volatile
        private var instance: DeliveryLocationService? = null

        fun isRunning() = running

        fun diagnosticCode() = diagnostic

        fun lastSampleReceivedAt() = lastSampleReceivedAt

        fun activeDeliveryId(): String? = instance?.deliveryId

        fun flushPendingSamples(context: android.content.Context) {
            instance?.flushPendingSamples() ?: NativeSampleStore(context.applicationContext).pending().forEach { sample ->
                MainActivity.sendNativeMessage(JSONObject().put("type", "shift_tracker_location:sample").put("sample", sample.toJson()).toString())
            }
        }

        fun acknowledgePendingSample(context: android.content.Context, sampleId: String) {
            instance?.acknowledge(sampleId) ?: NativeSampleStore(context.applicationContext).acknowledge(sampleId)
        }
    }

    private lateinit var fusedLocationClient: FusedLocationProviderClient
    private lateinit var sampleStore: NativeSampleStore
    private lateinit var preferences: SharedPreferences
    private var deliveryId: String? = null
    private var requestGeneration = 0L
    private var sampleReceivedForSession = false

    private val locationCallback = object : LocationCallback() {
        override fun onLocationResult(result: LocationResult) {
            result.locations.forEach(::recordProviderLocation)
        }
    }

    override fun onCreate() {
        super.onCreate()
        instance = this
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this)
        sampleStore = NativeSampleStore(this)
        preferences = getSharedPreferences(PREFS_NAME, MODE_PRIVATE)
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> stopTracking()
            ACTION_START -> {
                val requestedDeliveryId = intent.getStringExtra(EXTRA_DELIVERY_ID)?.trim()
                if (requestedDeliveryId.isNullOrEmpty() || requestedDeliveryId.length > 128) {
                    emitState("service_not_started", null, "A valid delivery session was not supplied")
                    stopSelf()
                } else startTracking(requestedDeliveryId)
            }
            null -> preferences.getString(PREF_DELIVERY_ID, null)?.trim()?.takeIf { it.isNotEmpty() }?.let(::startTracking)
        }
        // If Android recreates the service after a process reclaim, restore
        // the active delivery id from the small native journal and continue.
        return START_STICKY
    }

    private fun startTracking(requestedDeliveryId: String) {
        if (running && deliveryId == requestedDeliveryId) {
            flushPendingSamples()
            emitState(if (sampleReceivedForSession) "sample_received" else "waiting_for_fix", requestedDeliveryId, null)
            return
        }
        if (deliveryId != null && deliveryId != requestedDeliveryId) {
            requestGeneration += 1
            fusedLocationClient.removeLocationUpdates(locationCallback)
            running = false
            deliveryId = null
        }
        if (!hasPreciseLocationPermission() || !hasNotificationPermission()) {
            emitState("permission_required", requestedDeliveryId, "Precise location and the persistent tracking notification permission are required")
            failTracking()
            return
        }
        if (!isLocationProviderEnabled()) {
            emitState("location_provider_disabled", requestedDeliveryId, "Android Location services are disabled; turn on Location and retry the delivery")
            failTracking()
            return
        }
        deliveryId = requestedDeliveryId
        sampleReceivedForSession = false
        lastSampleReceivedAt = null
        diagnostic = "SERVICE_NOT_STARTED"
        preferences.edit().putString(PREF_DELIVERY_ID, requestedDeliveryId).apply()
        val foregroundStarted = runCatching { startForegroundCompat() }.isSuccess
        if (!foregroundStarted) {
            emitState("service_not_started", requestedDeliveryId, "Android could not start the location foreground service; check location and notification permissions")
            failTracking()
            return
        }
        running = true
        emitState("service_started", requestedDeliveryId, "Persistent delivery GPS notification posted; requesting precise location")
        val generation = ++requestGeneration
        val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5_000L)
            .setMinUpdateIntervalMillis(2_000L)
            .setMinUpdateDistanceMeters(5f)
            .setMaxUpdateDelayMillis(10_000L)
            .build()
        runCatching {
            fusedLocationClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper())
                .addOnSuccessListener {
                    if (generation != requestGeneration || deliveryId != requestedDeliveryId) return@addOnSuccessListener
                    diagnostic = "WAITING_FOR_FIX"
                    emitState("waiting_for_fix", deliveryId, "Foreground service is running; waiting for the first precise location fix")
                    flushPendingSamples()
                }
                .addOnFailureListener {
                    if (generation != requestGeneration || deliveryId != requestedDeliveryId) return@addOnFailureListener
                    emitState("service_not_started", deliveryId, "Android location provider could not start")
                    failTracking()
                }
        }.onFailure {
            if (generation != requestGeneration || deliveryId != requestedDeliveryId) return@onFailure
            emitState("service_not_started", deliveryId, "Android location provider could not start")
            failTracking()
        }
    }

    private fun recordProviderLocation(location: Location) {
        val id = deliveryId ?: return
        // Provider timestamps and accuracy are retained exactly as supplied.
        // Invalid provider values are rejected; no current-time interpolation.
        if (location.time <= 0L || !location.latitude.isFinite() || location.latitude !in -90.0..90.0 || !location.longitude.isFinite() || location.longitude !in -180.0..180.0 || !location.accuracy.isFinite() || location.accuracy < 0f || location.accuracy > 250f) return
        val sample = NativeLocationSample(
            sampleId = "$id:${location.time}",
            deliveryId = id,
            latitude = location.latitude,
            longitude = location.longitude,
            timestampEpochMs = location.time,
            accuracy = location.accuracy,
            speed = if (location.hasSpeed() && location.speed.isFinite() && location.speed >= 0f) location.speed else null,
            heading = if (location.hasBearing() && location.bearing.isFinite()) location.bearing else null,
        )
        sampleStore.append(sample)
        if (!sampleReceivedForSession) {
            sampleReceivedForSession = true
            lastSampleReceivedAt = location.time
            diagnostic = "SAMPLE_RECEIVED"
            emitState("sample_received", id, "Native GPS sample received and sent to the hosted PWA")
        }
        MainActivity.sendNativeMessage(sampleMessage(sample))
    }

    fun flushPendingSamples() {
        sampleStore.pending().forEach { sample -> MainActivity.sendNativeMessage(sampleMessage(sample)) }
    }

    fun acknowledge(sampleId: String) = sampleStore.acknowledge(sampleId)

    private fun stopTracking() {
        requestGeneration += 1
        fusedLocationClient.removeLocationUpdates(locationCallback)
        running = false
        diagnostic = "STOPPED"
        emitState("stopped", deliveryId, null)
        deliveryId = null
        sampleReceivedForSession = false
        lastSampleReceivedAt = null
        preferences.edit().remove(PREF_DELIVERY_ID).apply()
        stopForegroundCompat()
        stopSelf()
    }

    private fun failTracking() {
        requestGeneration += 1
        fusedLocationClient.removeLocationUpdates(locationCallback)
        running = false
        deliveryId = null
        preferences.edit().remove(PREF_DELIVERY_ID).apply()
        stopForegroundCompat()
        stopSelf()
    }

    override fun onDestroy() {
        fusedLocationClient.removeLocationUpdates(locationCallback)
        running = false
        if (instance === this) instance = null
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun hasPreciseLocationPermission() = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED && ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun hasNotificationPermission() = Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun hasBackgroundLocationPermission() = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED

    private fun isLocationProviderEnabled(): Boolean = runCatching {
        val manager = getSystemService(LocationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) manager.isLocationEnabled
        else manager.isProviderEnabled(LocationManager.GPS_PROVIDER) || manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
    }.getOrDefault(false)

    private fun startForegroundCompat() {
        val notification: Notification = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentTitle("Shift Tracker delivery GPS")
            .setContentText("Delivery tracking is active")
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) startForeground(NOTIFICATION_ID, notification, android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        else startForeground(NOTIFICATION_ID, notification)
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(NOTIFICATION_CHANNEL_ID, "Delivery GPS", NotificationManager.IMPORTANCE_LOW).apply {
            description = "Visible while Shift Tracker records an active delivery route"
            setShowBadge(false)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) stopForeground(Service.STOP_FOREGROUND_REMOVE)
        else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
    }

    private fun emitState(status: String, id: String?, message: String?) {
        diagnostic = diagnosticForStatus(status)
        MainActivity.sendNativeMessage(stateMessage(status, id, message))
    }

    private fun diagnosticForStatus(status: String): String = when (status) {
        "permission_required" -> "PERMISSION_MISSING"
        "location_provider_disabled" -> "LOCATION_PROVIDER_DISABLED"
        "waiting_for_fix", "active" -> "WAITING_FOR_FIX"
        "sample_received" -> "SAMPLE_RECEIVED"
        "service_started" -> "SERVICE_ACTIVE"
        "stopped", "background_permission_granted" -> "STOPPED"
        "background_permission_required", "background_settings_opened" -> "BACKGROUND_PERMISSION_MISSING"
        else -> "SERVICE_NOT_STARTED"
    }

    private fun diagnosticsJson(): JSONObject = JSONObject()
        .put("diagnostic", diagnostic)
        .put("foregroundLocation", when {
            hasPreciseLocationPermission() -> "precise"
            ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED -> "approximate"
            else -> "missing"
        })
        .put("backgroundLocationGranted", hasBackgroundLocationPermission())
        .put("notificationsGranted", hasNotificationPermission())
        .put("locationProviderEnabled", isLocationProviderEnabled())
        .put("serviceRunning", running)
        .put("lastSampleReceivedAt", lastSampleReceivedAt ?: JSONObject.NULL)
        .put("backgroundPermissionLabel", if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) packageManager.getBackgroundPermissionOptionLabel().toString() else "Allow all the time")

    private fun stateMessage(status: String, id: String?, message: String?): String = JSONObject()
        .put("type", "shift_tracker_location:state")
        .put("status", status)
        .put("diagnostic", diagnostic)
        .put("diagnostics", diagnosticsJson())
        .apply { if (id != null) put("deliveryId", id) }
        .apply { if (message != null) put("message", message) }
        .toString()

    private fun sampleMessage(sample: NativeLocationSample): String = JSONObject()
        .put("type", "shift_tracker_location:sample")
        .put("sample", sample.toJson())
        .toString()
}
