package site.chatgpt.traynor1987.dominosshifttracker

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.core.content.ContextCompat
import androidx.core.content.ContextCompat.startForegroundService
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import org.json.JSONObject

/**
 * Remote, origin-locked WebView shell. The PWA remains the source of truth;
 * this activity only brokers the native foreground GPS service after a
 * trusted PWA request. No camera or general-purpose file bridge is exposed.
 */
class MainActivity : ComponentActivity() {
    companion object {
        private const val TRUSTED_ORIGIN = "https://dominos-shift-tracker.traynor1987.chatgpt.site"
        private const val TRUSTED_HOST = "dominos-shift-tracker.traynor1987.chatgpt.site"
        private const val BRIDGE_NAME = "ShiftTrackerNative"
        private const val BRIDGE_VERSION = 1
        private const val LOCATION_PERMISSION_REQUEST = 2102
        private const val NOTIFICATION_PERMISSION_REQUEST = 2103
        private const val BACKGROUND_LOCATION_PERMISSION_REQUEST = 2104

        @Volatile
        private var activeActivity: MainActivity? = null

        /** Only the currently visible, exact-origin activity can receive data. */
        fun sendNativeMessage(payload: String) {
            activeActivity?.postNativeMessage(payload)
        }
    }

    private lateinit var webView: WebView
    private var pendingStartDeliveryId: String? = null
    private var backgroundSettingsRequested = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        activeActivity = this
        webView = WebView(this)
        configureWebView(webView)
        setContentView(webView)
        if (savedInstanceState == null) webView.loadUrl(TRUSTED_ORIGIN)
    }

    override fun onResume() {
        super.onResume()
        activeActivity = this
        // Samples can have accumulated while the WebView was backgrounded.
        // They remain encrypted until the trusted page acknowledges them.
        DeliveryLocationService.flushPendingSamples(this)
        if (::webView.isInitialized && isTrustedUri(Uri.parse(webView.url ?: ""))) sendShellReady()
        if (backgroundSettingsRequested) {
            backgroundSettingsRequested = false
            val deliveryId = DeliveryLocationService.activeDeliveryId()
            if (hasBackgroundLocationPermission()) {
                sendNativeState("background_permission_granted", deliveryId, "${backgroundPermissionLabel()} is enabled; active-delivery tracking can continue after the Activity is hidden")
            } else {
                sendNativeState("background_permission_required", deliveryId, "Open App permissions → Location and choose ${backgroundPermissionLabel()} if Android requires it")
            }
        }
    }

    override fun onDestroy() {
        // Do not stop the foreground service here. Screen-off/background
        // lifecycle changes must not end an active delivery route.
        if (activeActivity === this) activeActivity = null
        super.onDestroy()
    }

    private fun configureWebView(view: WebView) {
        view.settings.javaScriptEnabled = true
        view.settings.domStorageEnabled = true
        view.settings.allowFileAccess = false
        view.settings.allowContentAccess = false
        view.settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        view.settings.setSupportMultipleWindows(false)
        view.webViewClient = TrustedOriginClient()

        // Do not use addJavascriptInterface. AndroidX exposes this object only
        // to the exact allowed HTTPS origin, and every received message is
        // checked again before it receives even a version response.
        WebViewCompat.addWebMessageListener(
            view,
            BRIDGE_NAME,
            setOf(TRUSTED_ORIGIN),
            object : WebViewCompat.WebMessageListener {
                override fun onPostMessage(
                    view: WebView,
                    message: WebMessageCompat,
                    sourceOrigin: Uri,
                    isMainFrame: Boolean,
                    replyProxy: JavaScriptReplyProxy,
                ) {
                    if (!isMainFrame || !isTrustedUri(sourceOrigin)) return
                    handleBridgeMessage(message.data)
                }
            },
        )
    }

    private fun handleBridgeMessage(raw: String?) {
        val message = runCatching { JSONObject(raw ?: return) }.getOrNull() ?: return
        when (message.optString("type")) {
            "shift_tracker_shell:hello", "shift_tracker_shell:refresh_requested" -> {
                sendShellReady()
                DeliveryLocationService.flushPendingSamples(this)
            }
            "shift_tracker_location:start" -> requestNativeLocationStart(message.optString("deliveryId"))
            "shift_tracker_location:stop" -> stopNativeLocation(message.optString("deliveryId"))
            "shift_tracker_location:background_request" -> requestBackgroundLocation()
            "shift_tracker_location:ack" -> {
                val sampleId = message.optString("sampleId").trim()
                if (sampleId.isNotEmpty() && sampleId.length <= 256) DeliveryLocationService.acknowledgePendingSample(this, sampleId)
            }
        }
    }

    private fun sendShellReady() {
        val payload = JSONObject().apply {
            put("type", "shift_tracker_shell:ready")
            put("shellVersion", BuildConfig.VERSION_NAME)
            put("bridgeVersion", BRIDGE_VERSION)
            put("trustedOrigin", TRUSTED_ORIGIN)
            put("trackingActive", DeliveryLocationService.isRunning())
            put("diagnostics", nativeDiagnostics())
        }.toString()
        postNativeMessage(payload)
    }

    private fun postNativeMessage(payload: String) {
        if (!::webView.isInitialized || !isTrustedUri(Uri.parse(webView.url ?: ""))) return
        WebViewCompat.postWebMessage(webView, WebMessageCompat(payload), Uri.parse(TRUSTED_ORIGIN))
    }

    private fun requestNativeLocationStart(rawDeliveryId: String?) {
        val deliveryId = rawDeliveryId?.trim()
        if (deliveryId.isNullOrEmpty() || deliveryId.length > 128) {
            sendNativeState("error", null, "A valid delivery session was not supplied")
            return
        }
        pendingStartDeliveryId = deliveryId
        if (!hasPreciseLocationPermission()) {
            requestPermissions(requiredRuntimePermissions().toTypedArray(), LOCATION_PERMISSION_REQUEST)
            sendNativeState("permission_required", deliveryId, "Allow Precise location first. Android asks for foreground location before any background-location option")
            return
        }
        if (!hasNotificationPermission()) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATION_PERMISSION_REQUEST)
            sendNativeState("permission_required", deliveryId, "Allow notifications so Android can show the persistent delivery GPS notification")
            return
        }
        startNativeLocationService(deliveryId)
    }

    private fun startNativeLocationService(deliveryId: String) {
        pendingStartDeliveryId = null
        val intent = Intent(this, DeliveryLocationService::class.java)
            .setAction(DeliveryLocationService.ACTION_START)
            .putExtra(DeliveryLocationService.EXTRA_DELIVERY_ID, deliveryId)
        sendNativeState("service_starting", deliveryId, "Native delivery GPS start requested; waiting for the foreground service")
        runCatching { startForegroundService(this, intent) }
            .onFailure { sendNativeState("service_not_started", deliveryId, "Android rejected the delivery GPS service start") }
    }

    private fun stopNativeLocation(@Suppress("UNUSED_PARAMETER") requestedDeliveryId: String?) {
        pendingStartDeliveryId = null
        val intent = Intent(this, DeliveryLocationService::class.java).setAction(DeliveryLocationService.ACTION_STOP)
        // Always enqueue the stop command, even if the start request has not
        // completed its asynchronous provider callback yet. Android orders
        // service commands, so a fast Back at Store cannot leave a late start
        // running in the background.
        runCatching { startService(intent) }
            .onFailure { sendNativeState("error", null, "Android could not stop the delivery GPS service") }
    }

    private fun sendNativeState(status: String, deliveryId: String?, message: String?) {
        val diagnostics = nativeDiagnostics().put("diagnostic", diagnosticForStatus(status))
        val payload = JSONObject()
            .put("type", "shift_tracker_location:state")
            .put("status", status)
            .put("diagnostic", diagnosticForStatus(status))
            .put("diagnostics", diagnostics)
            .apply { if (!deliveryId.isNullOrBlank()) put("deliveryId", deliveryId) }
            .apply { if (!message.isNullOrBlank()) put("message", message) }
            .toString()
        postNativeMessage(payload)
    }

    /** Foreground permission only. Background location is deliberately staged later. */
    private fun requiredRuntimePermissions(): List<String> = listOf(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
    )

    private fun hasPermission(permission: String) = ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    private fun hasPreciseLocationPermission() = hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) && hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)

    private fun hasBackgroundLocationPermission() = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || hasPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION)

    private fun hasNotificationPermission() = Build.VERSION.SDK_INT < 33 || hasPermission(Manifest.permission.POST_NOTIFICATIONS)

    private fun requestBackgroundLocation() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || hasBackgroundLocationPermission()) {
            sendNativeState("background_permission_granted", DeliveryLocationService.activeDeliveryId(), "${backgroundPermissionLabel()} is already available")
            sendShellReady()
            return
        }
        val deliveryId = DeliveryLocationService.activeDeliveryId()
        val message = "To enable ${backgroundPermissionLabel()}, open App permissions → Location. This is optional capability; GPS still runs only during an active delivery."
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Android 11+ intentionally does not show an Allow all the time
            // option in the runtime dialog. The user must choose it in the
            // app's Location permission settings page.
            backgroundSettingsRequested = true
            sendNativeState("background_permission_required", deliveryId, message)
            runCatching {
                startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:$packageName")
                })
            }.onFailure {
                backgroundSettingsRequested = false
                sendNativeState("service_not_started", deliveryId, "Android could not open the app Location permission settings")
            }
        } else {
            // Android 10 can show the separate background permission dialog,
            // but only after foreground location has already been granted.
            sendNativeState("background_permission_required", deliveryId, message)
            requestPermissions(arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION), BACKGROUND_LOCATION_PERMISSION_REQUEST)
        }
    }

    private fun backgroundPermissionLabel(): String = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        packageManager.getBackgroundPermissionOptionLabel().toString()
    } else "Allow all the time"

    private fun isLocationProviderEnabled(): Boolean = runCatching {
        val manager = getSystemService(android.location.LocationManager::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) manager.isLocationEnabled
        else manager.isProviderEnabled(android.location.LocationManager.GPS_PROVIDER) || manager.isProviderEnabled(android.location.LocationManager.NETWORK_PROVIDER)
    }.getOrDefault(false)

    private fun nativeDiagnostics(): JSONObject = JSONObject()
        .put("diagnostic", currentDiagnosticCode())
        .put("foregroundLocation", when {
            hasPreciseLocationPermission() -> "precise"
            hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION) -> "approximate"
            else -> "missing"
        })
        .put("backgroundLocationGranted", hasBackgroundLocationPermission())
        .put("notificationsGranted", hasNotificationPermission())
        .put("locationProviderEnabled", isLocationProviderEnabled())
        .put("serviceRunning", DeliveryLocationService.isRunning())
        .put("lastSampleReceivedAt", DeliveryLocationService.lastSampleReceivedAt() ?: JSONObject.NULL)
        .put("backgroundPermissionLabel", backgroundPermissionLabel())

    private fun currentDiagnosticCode(): String {
        val serviceCode = DeliveryLocationService.diagnosticCode()
        if (serviceCode != "STOPPED" && serviceCode != "SERVICE_NOT_STARTED") return serviceCode
        if (!hasPreciseLocationPermission() || !hasNotificationPermission()) return "PERMISSION_MISSING"
        if (!isLocationProviderEnabled()) return "LOCATION_PROVIDER_DISABLED"
        return "SERVICE_NOT_STARTED"
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

    private fun continuePendingNativeStart() {
        val deliveryId = pendingStartDeliveryId ?: return
        if (!hasPreciseLocationPermission()) {
            pendingStartDeliveryId = null
            sendNativeState("permission_required", deliveryId, "Precise location is required for native delivery GPS")
        } else if (!hasNotificationPermission()) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATION_PERMISSION_REQUEST)
            sendNativeState("permission_required", deliveryId, "Allow notifications so Android can show the persistent delivery GPS notification")
        } else startNativeLocationService(deliveryId)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        when (requestCode) {
            LOCATION_PERMISSION_REQUEST, NOTIFICATION_PERMISSION_REQUEST -> continuePendingNativeStart()
            BACKGROUND_LOCATION_PERMISSION_REQUEST -> {
                val deliveryId = DeliveryLocationService.activeDeliveryId()
                if (hasBackgroundLocationPermission()) sendNativeState("background_permission_granted", deliveryId, "${backgroundPermissionLabel()} is enabled")
                else sendNativeState("background_permission_required", deliveryId, "Background location remains off; enable ${backgroundPermissionLabel()} from App permissions → Location if required")
                sendShellReady()
            }
        }
    }

    private fun isTrustedUri(uri: Uri): Boolean =
        uri.scheme == "https" && uri.host == TRUSTED_HOST && uri.port == -1

    private inner class TrustedOriginClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            if (!request.isForMainFrame) return false
            if (isTrustedUri(request.url)) return false
            runCatching { startActivity(Intent(Intent.ACTION_VIEW, request.url)) }
            return true
        }

        override fun onPageFinished(view: WebView, url: String) {
            super.onPageFinished(view, url)
            if (isTrustedUri(Uri.parse(url))) sendShellReady()
        }
    }
}
