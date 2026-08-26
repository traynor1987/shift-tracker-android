package site.chatgpt.traynor1987.dominosshifttracker

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.MediaStore
import android.provider.Settings
import android.webkit.ValueCallback
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.content.ContextCompat.startForegroundService
import androidx.core.content.FileProvider
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import org.json.JSONObject
import java.io.File
import java.nio.charset.StandardCharsets

/**
 * Remote, origin-locked WebView shell. The PWA remains the source of truth;
 * this activity only brokers the native foreground GPS service after a
 * trusted PWA request. User-selected camera/files and explicit JSON/CSV export
 * use Android system pickers; no broad storage or arbitrary filesystem bridge
 * is exposed.
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
        private const val ROTA_NOTIFICATION_PERMISSION_REQUEST = 2105
        private const val MAX_EXPORTED_FILE_CHARS = 20_000_000

        @Volatile
        private var activeActivity: MainActivity? = null

        /** Only the currently visible, exact-origin activity can receive data. */
        fun sendNativeMessage(payload: String): Boolean = activeActivity?.postNativeMessage(payload) ?: false
    }

    private lateinit var webView: WebView
    private var pendingStartDeliveryId: String? = null
    private var backgroundSettingsRequested = false
    private var pendingBackgroundPermissionRequest = false
    private var pendingBackgroundDeliveryId: String? = null
    private var trustedReplyProxy: JavaScriptReplyProxy? = null
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var cameraCaptureUri: Uri? = null
    private var cameraCaptureFile: File? = null
    private var pendingFileSave: PendingFileSave? = null

    private data class PendingFileSave(
        val requestId: String,
        val filename: String,
        val mimeType: String,
        val content: String,
    )

    private val fileChooserLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = fileChooserCallback ?: return@registerForActivityResult
        val selected = if (result.resultCode == Activity.RESULT_OK) {
            WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
                ?: cameraCaptureUri?.let { arrayOf(it) }
        } else null
        callback.onReceiveValue(selected)
        fileChooserCallback = null
        if (selected == null || cameraCaptureUri !in selected) cameraCaptureFile?.delete()
        cameraCaptureUri = null
        cameraCaptureFile = null
    }

    private val createDocumentLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val request = pendingFileSave ?: return@registerForActivityResult
        pendingFileSave = null
        if (result.resultCode != Activity.RESULT_OK || result.data?.data == null) {
            sendFileSaveResult(request.requestId, "cancelled", "No file was replaced or created")
            return@registerForActivityResult
        }
        val uri = result.data!!.data!!
        runCatching {
            contentResolver.openOutputStream(uri, "w")?.use { output ->
                output.write(request.content.toByteArray(StandardCharsets.UTF_8))
            } ?: error("Android did not provide a writable destination")
        }.onSuccess {
            sendFileSaveResult(request.requestId, "saved", "Saved with the Android document picker")
        }.onFailure {
            sendFileSaveResult(request.requestId, "error", "Android could not write the selected file")
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        activeActivity = this
        webView = WebView(this)
        configureWebView(webView)
        setContentView(webView)
        // A newly created WebView is blank even when the Activity receives a
        // non-null state bundle. Restore the WebView state explicitly; if
        // Android reclaimed it, load the trusted hosted PWA instead of leaving
        // a permanent black surface until the task is force-closed.
        val restored = savedInstanceState?.let { webView.restoreState(it) != null } ?: false
        if (!restored) webView.loadUrl(TRUSTED_ORIGIN)
    }

    override fun onResume() {
        super.onResume()
        activeActivity = this
        if (::webView.isInitialized) {
            webView.onResume()
            webView.resumeTimers()
            webView.postDelayed({
                if (!isFinishing && !isDestroyed && webView.url.isNullOrBlank()) webView.loadUrl(TRUSTED_ORIGIN)
                else webView.invalidate()
            }, 350L)
        }
        // Samples can have accumulated while the WebView was backgrounded.
        // They remain encrypted until the trusted page acknowledges them.
        DeliveryLocationService.flushPendingSamples(this)
        if (::webView.isInitialized && isTrustedUri(Uri.parse(webView.url ?: ""))) sendShellReady()
        if (backgroundSettingsRequested) {
            backgroundSettingsRequested = false
            val deliveryId = DeliveryLocationService.activeDeliveryId(this)
            if (hasBackgroundLocationPermission()) {
                sendNativeState("background_permission_granted", deliveryId, "${backgroundPermissionLabel()} is enabled; active-delivery tracking can continue after the Activity is hidden")
            } else {
                sendNativeState("background_permission_required", deliveryId, "Open App permissions → Location and choose ${backgroundPermissionLabel()} if Android requires it")
            }
        }
    }

    override fun onPause() {
        if (::webView.isInitialized) webView.onPause()
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        if (::webView.isInitialized) webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        // Do not stop the foreground service here. Screen-off/background
        // lifecycle changes must not end an active delivery route.
        if (activeActivity === this) activeActivity = null
        trustedReplyProxy = null
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        pendingFileSave?.let { sendFileSaveResult(it.requestId, "cancelled", "The save was cancelled") }
        pendingFileSave = null
        cameraCaptureFile?.delete()
        if (::webView.isInitialized) webView.destroy()
        super.onDestroy()
    }

    private fun recreateWebViewAfterRendererExit(failedView: WebView) {
        trustedReplyProxy = null
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        cameraCaptureFile?.delete()
        cameraCaptureFile = null
        cameraCaptureUri = null
        if (failedView === webView) {
            val replacement = WebView(this)
            configureWebView(replacement)
            webView = replacement
            setContentView(replacement)
            failedView.destroy()
            replacement.loadUrl(TRUSTED_ORIGIN)
        } else failedView.destroy()
    }

    private fun configureWebView(view: WebView) {
        view.settings.javaScriptEnabled = true
        view.settings.domStorageEnabled = true
        view.settings.allowFileAccess = false
        view.settings.allowContentAccess = false
        view.settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
        view.settings.setSupportMultipleWindows(false)
        view.webViewClient = TrustedOriginClient()
        view.webChromeClient = TrustedFileChooser()

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
                    // AndroidX binds this proxy 1:1 to the injected bridge
                    // object in the exact trusted main frame. Use it for every
                    // native reply instead of sending unrelated window
                    // messages whose JavaScript origin is not the page origin.
                    trustedReplyProxy = replyProxy
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
            "shift_tracker_file:save" -> requestNativeFileSave(message)
            "shift_tracker_rota:sync" -> {
                val count = RotaReminderScheduler.replace(this, message.optJSONArray("reminders") ?: org.json.JSONArray())
                postNativeMessage(JSONObject().put("type", "shift_tracker_rota:sync_result").put("scheduled", count).toString())
            }
            "shift_tracker_rota:request_permission" -> {
                if (Build.VERSION.SDK_INT >= 33 && !hasNotificationPermission()) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), ROTA_NOTIFICATION_PERMISSION_REQUEST)
            }
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
            put("trackedDeliveryId", DeliveryLocationService.activeDeliveryId(this@MainActivity) ?: JSONObject.NULL)
            put("diagnostics", nativeDiagnostics())
        }.toString()
        postNativeMessage(payload)
    }

    private fun postNativeMessage(payload: String): Boolean {
        if (!::webView.isInitialized || !isTrustedUri(Uri.parse(webView.url ?: ""))) return false
        return runCatching {
            trustedReplyProxy?.postMessage(payload)
                ?: WebViewCompat.postWebMessage(webView, WebMessageCompat(payload), Uri.parse(TRUSTED_ORIGIN))
        }.isSuccess
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
            sendNativeState("background_permission_granted", DeliveryLocationService.activeDeliveryId(this), "${backgroundPermissionLabel()} is already available")
            sendShellReady()
            return
        }
        val deliveryId = DeliveryLocationService.activeDeliveryId(this)
        if (!hasPreciseLocationPermission()) {
            // Background permission is never requested in the same call as
            // foreground location. Complete the foreground stage first, then
            // continue this request from its callback.
            pendingBackgroundPermissionRequest = true
            pendingBackgroundDeliveryId = deliveryId
            sendNativeState("permission_required", deliveryId, "Grant Precise foreground location first; Android requires a separate background-location stage")
            requestPermissions(requiredRuntimePermissions().toTypedArray(), LOCATION_PERMISSION_REQUEST)
            return
        }
        requestBackgroundPermissionStage(deliveryId)
    }

    private fun requestBackgroundPermissionStage(deliveryId: String?) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || hasBackgroundLocationPermission()) {
            sendNativeState("background_permission_granted", deliveryId, "${backgroundPermissionLabel()} is already available")
            sendShellReady()
            return
        }
        // This is deliberately a second stage after precise foreground
        // permission. Android 11+ exposes Allow all the time only in App info;
        // requesting it again at runtime creates a misleading dead end on many
        // Samsung builds, so take the user directly to the correct app screen.
        sendNativeState(
            "background_permission_required",
            deliveryId,
            "Precise foreground location is granted. Android will now guide you to App info → Permissions → Location → ${backgroundPermissionLabel()}. Tracking remains limited to an active delivery.",
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) openBackgroundPermissionSettings(deliveryId)
        else runCatching {
            requestPermissions(arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION), BACKGROUND_LOCATION_PERMISSION_REQUEST)
        }.onFailure { openBackgroundPermissionSettings(deliveryId) }
    }

    private fun requestNativeFileSave(message: JSONObject) {
        val requestId = message.optString("requestId").trim()
        val filename = message.optString("filename").trim()
        val mimeType = message.optString("mimeType").trim().substringBefore(';').lowercase()
        val content = message.optString("content", null)
        val safeName = filename.length in 1..120 && filename == File(filename).name &&
            filename.matches(Regex("[A-Za-z0-9][A-Za-z0-9._ -]*"))
        val allowedType = (mimeType == "application/json" && filename.endsWith(".json", true)) ||
            (mimeType == "text/csv" && filename.endsWith(".csv", true))
        if (requestId.isEmpty() || requestId.length > 128 || !safeName || !allowedType || content == null || content.length > MAX_EXPORTED_FILE_CHARS) {
            if (requestId.isNotEmpty() && requestId.length <= 128) sendFileSaveResult(requestId, "error", "The requested export was not an allowed JSON or CSV file")
            return
        }
        if (pendingFileSave != null) {
            sendFileSaveResult(requestId, "error", "Finish the current file save first")
            return
        }
        pendingFileSave = PendingFileSave(requestId, filename, mimeType, content)
        runCatching {
            createDocumentLauncher.launch(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = mimeType
                putExtra(Intent.EXTRA_TITLE, filename)
            })
        }.onFailure {
            pendingFileSave = null
            sendFileSaveResult(requestId, "error", "Android could not open the document picker")
        }
    }

    private fun sendFileSaveResult(requestId: String, status: String, message: String) {
        postNativeMessage(JSONObject()
            .put("type", "shift_tracker_file:save_result")
            .put("requestId", requestId)
            .put("status", status)
            .put("message", message)
            .toString())
    }

    private fun openBackgroundPermissionSettings(deliveryId: String?) {
        if (hasBackgroundLocationPermission()) {
            sendNativeState("background_permission_granted", deliveryId, "${backgroundPermissionLabel()} is enabled")
            sendShellReady()
            return
        }
        backgroundSettingsRequested = true
        sendNativeState(
            "background_settings_opened",
            deliveryId,
            "Android requires this second stage in App info. Open Permissions → Location and choose ${backgroundPermissionLabel()}; return to Shift Tracker when finished.",
        )
        runCatching {
            startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:$packageName")
            })
        }.onFailure {
            backgroundSettingsRequested = false
            sendNativeState("background_permission_required", deliveryId, "Android could not open Shift Tracker App info; open App info → Permissions → Location manually")
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
        .apply {
            val pipeline = DeliveryLocationService.pipelineDiagnostics()
            pipeline.keys().forEach { key -> put(key, pipeline.get(key)) }
        }

    private fun currentDiagnosticCode(): String {
        val serviceCode = DeliveryLocationService.diagnosticCode()
        if (serviceCode != "STOPPED" && serviceCode != "SERVICE_NOT_STARTED") return serviceCode
        if (!hasPreciseLocationPermission() || !hasNotificationPermission()) return "PERMISSION_MISSING"
        if (!isLocationProviderEnabled()) return "LOCATION_PROVIDER_DISABLED"
        return if (hasBackgroundLocationPermission()) "BACKGROUND_PERMISSION_GRANTED" else "FOREGROUND_PERMISSION_GRANTED"
    }

    private fun diagnosticForStatus(status: String): String = when (status) {
        "permission_required" -> "PERMISSION_MISSING"
        "foreground_permission_granted" -> "FOREGROUND_PERMISSION_GRANTED"
        "location_provider_disabled" -> "LOCATION_PROVIDER_DISABLED"
        "waiting_for_fix", "active" -> "WAITING_FOR_FIX"
        "sample_received" -> "SAMPLE_RECEIVED"
        "service_started" -> "SERVICE_ACTIVE"
        "background_permission_granted" -> "BACKGROUND_PERMISSION_GRANTED"
        "stopped" -> "STOPPED"
        "background_permission_required", "background_settings_opened" -> "BACKGROUND_PERMISSION_MISSING"
        else -> "SERVICE_NOT_STARTED"
    }

    private fun continuePendingNativeStart() {
        val deliveryId = pendingStartDeliveryId ?: return
        if (!hasPreciseLocationPermission()) {
            pendingStartDeliveryId = null
            sendNativeState("permission_required", deliveryId, "Precise location is required for native delivery GPS")
        } else {
            sendNativeState("foreground_permission_granted", deliveryId, "Precise foreground location granted; continuing the active-delivery startup")
            if (!hasNotificationPermission()) {
                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), NOTIFICATION_PERMISSION_REQUEST)
                sendNativeState("permission_required", deliveryId, "Allow notifications so Android can show the persistent delivery GPS notification")
            } else startNativeLocationService(deliveryId)
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        when (requestCode) {
            LOCATION_PERMISSION_REQUEST -> {
                if (pendingBackgroundPermissionRequest) {
                    pendingBackgroundPermissionRequest = false
                    val deliveryId = pendingBackgroundDeliveryId
                    pendingBackgroundDeliveryId = null
                    if (hasPreciseLocationPermission()) {
                        sendNativeState("foreground_permission_granted", deliveryId, "Precise foreground location granted; requesting background location separately")
                        requestBackgroundPermissionStage(deliveryId)
                    } else {
                        sendNativeState("permission_required", deliveryId, "Precise foreground location is still required before background location can be requested")
                    }
                } else continuePendingNativeStart()
            }
            NOTIFICATION_PERMISSION_REQUEST -> {
                if (hasNotificationPermission()) continuePendingNativeStart()
                else {
                    val deliveryId = pendingStartDeliveryId
                    pendingStartDeliveryId = null
                    sendNativeState("permission_required", deliveryId, "Allow notifications so Android can show the persistent delivery GPS notification, then start the delivery again")
                }
            }
            BACKGROUND_LOCATION_PERMISSION_REQUEST -> {
                val deliveryId = DeliveryLocationService.activeDeliveryId(this)
                if (hasBackgroundLocationPermission()) sendNativeState("background_permission_granted", deliveryId, "${backgroundPermissionLabel()} is enabled")
                else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) openBackgroundPermissionSettings(deliveryId)
                else {
                    sendNativeState("background_permission_required", deliveryId, "Background location remains off; enable ${backgroundPermissionLabel()} from App permissions → Location if required")
                    sendShellReady()
                }
            }
            ROTA_NOTIFICATION_PERMISSION_REQUEST -> {
                postNativeMessage(JSONObject().put("type", "shift_tracker_rota:permission").put("granted", hasNotificationPermission()).toString())
                if (hasNotificationPermission()) RotaReminderScheduler.scheduleStored(this)
            }
        }
    }

    private fun isTrustedUri(uri: Uri): Boolean =
        uri.scheme == "https" && uri.host == TRUSTED_HOST && uri.port == -1

    private inner class TrustedOriginClient : WebViewClient() {
        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
            recreateWebViewAfterRendererExit(view)
            return true
        }

        override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
            trustedReplyProxy = null
            super.onPageStarted(view, url, favicon)
        }

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

    private inner class TrustedFileChooser : WebChromeClient() {
        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams,
        ): Boolean {
            if (!isTrustedUri(Uri.parse(webView.url ?: ""))) return false
            fileChooserCallback?.onReceiveValue(null)
            fileChooserCallback = filePathCallback
            cameraCaptureFile?.delete()
            cameraCaptureFile = null
            cameraCaptureUri = null

            val acceptTypes = fileChooserParams.acceptTypes.map { it.substringBefore(';').trim().lowercase() }.filter { it.isNotEmpty() }
            val imageRequest = acceptTypes.isEmpty() || acceptTypes.any { it == "image/*" || it.startsWith("image/") }
            val openIntent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE)
                type = when {
                    acceptTypes.isEmpty() -> "*/*"
                    acceptTypes.size == 1 -> acceptTypes.first()
                    else -> "*/*"
                }
                if (acceptTypes.size > 1) putExtra(Intent.EXTRA_MIME_TYPES, acceptTypes.toTypedArray())
                putExtra(Intent.EXTRA_ALLOW_MULTIPLE, fileChooserParams.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
            }
            val cameraIntent = if (imageRequest) createCameraIntent() else null
            val launchIntent = if (fileChooserParams.isCaptureEnabled && cameraIntent != null) cameraIntent else Intent(Intent.ACTION_CHOOSER).apply {
                putExtra(Intent.EXTRA_INTENT, openIntent)
                putExtra(Intent.EXTRA_TITLE, if (imageRequest) "Take or choose a photo" else "Choose a file")
                if (cameraIntent != null) putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(cameraIntent))
            }
            return runCatching { fileChooserLauncher.launch(launchIntent) }.fold(
                onSuccess = { true },
                onFailure = {
                    fileChooserCallback?.onReceiveValue(null)
                    fileChooserCallback = null
                    cameraCaptureFile?.delete()
                    cameraCaptureFile = null
                    cameraCaptureUri = null
                    false
                },
            )
        }

        private fun createCameraIntent(): Intent? {
            val cameraIntent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
            if (cameraIntent.resolveActivity(packageManager) == null) return null
            val directory = File(cacheDir, "shift-tracker-camera").apply { mkdirs() }
            val output = File.createTempFile("delivery-photo-", ".jpg", directory)
            val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.fileprovider", output)
            cameraCaptureFile = output
            cameraCaptureUri = uri
            return cameraIntent.apply {
                putExtra(MediaStore.EXTRA_OUTPUT, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                clipData = ClipData.newRawUri("Shift Tracker photo", uri)
            }
        }
    }
}
