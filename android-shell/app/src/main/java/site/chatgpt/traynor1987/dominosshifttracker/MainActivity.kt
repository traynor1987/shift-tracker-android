package site.chatgpt.traynor1987.dominosshifttracker

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
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
import androidx.activity.result.PickVisualMediaRequest
import androidx.core.content.ContextCompat
import androidx.core.content.ContextCompat.startForegroundService
import androidx.core.content.FileProvider
import androidx.core.view.WindowCompat
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject
import java.io.File
import java.nio.charset.StandardCharsets
import java.util.Base64
import java.util.concurrent.Executors

/**
 * Origin-locked WebView shell. The PWA remains the source of truth;
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
        private const val WORK_NOTIFICATION_PERMISSION_REQUEST = 2106
        private const val SHIFT_NOTIFICATION_PERMISSION_REQUEST = 2107
        private const val MAX_EXPORTED_FILE_CHARS = 20_000_000
        private const val MAX_SHARED_FILE_BYTES = 25_000_000

        @Volatile
        private var activeActivity: MainActivity? = null

        /** Only the currently visible, exact-origin activity can receive data. */
        fun sendNativeMessage(payload: String): Boolean = activeActivity?.postNativeMessageOnUiThread(payload) ?: false
    }

    private lateinit var webView: WebView
    private lateinit var webReleaseStore: VerifiedWebReleaseStore
    private lateinit var apkUpdateManager: AndroidApkUpdateManager
    private lateinit var wearUpdateManager: WearUpdateManager
    private val webReleaseExecutor = Executors.newSingleThreadExecutor()
    private var pendingStartDeliveryId: String? = null
    private var backgroundSettingsRequested = false
    private var pendingBackgroundPermissionRequest = false
    private var pendingBackgroundDeliveryId: String? = null
    private var trustedReplyProxy: JavaScriptReplyProxy? = null
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var cameraCaptureUri: Uri? = null
    private var cameraCaptureFile: File? = null
    private var pendingFileSave: PendingFileSave? = null
    private var pendingWorkNotification: String? = null
    private var expectedLocalReleaseHello: String? = null
    private var localReleaseFallbackAttempted = false
    private var wearConnectionKnown = false
    private var wearConnected = false

    private data class PendingFileSave(
        val requestId: String,
        val filename: String,
        val mimeType: String,
        val content: String,
    )

    private val fileChooserLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = fileChooserCallback ?: return@registerForActivityResult
        val selected = if (result.resultCode == Activity.RESULT_OK) {
            selectedUris(result.data).ifEmpty { cameraCaptureUri?.let(::listOf) ?: emptyList() }.toTypedArray().takeIf { it.isNotEmpty() }
        } else null
        callback.onReceiveValue(selected)
        fileChooserCallback = null
        if (selected == null || cameraCaptureUri !in selected) cameraCaptureFile?.delete()
        cameraCaptureUri = null
        cameraCaptureFile = null
    }

    private val multiplePhotoPickerLauncher = registerForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(50)) { uris ->
        val callback = fileChooserCallback ?: return@registerForActivityResult
        callback.onReceiveValue(uris.distinct().toTypedArray().takeIf { it.isNotEmpty() })
        fileChooserCallback = null
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
        WindowCompat.setDecorFitsSystemWindows(window, true)
        window.statusBarColor = android.graphics.Color.TRANSPARENT
        window.navigationBarColor = android.graphics.Color.TRANSPARENT
        activeActivity = this
        webReleaseStore = VerifiedWebReleaseStore(this)
        apkUpdateManager = AndroidApkUpdateManager(this, webReleaseExecutor, ::postApkUpdate)
        wearUpdateManager = WearUpdateManager(this, webReleaseExecutor, ::postApkUpdate)
        webView = WebView(this)
        configureWebView(webView)
        setContentView(webView)
        queueActionFromIntent(intent)
        // A newly created WebView is blank even when the Activity receives a
        // non-null state bundle. Restore the WebView state explicitly; if
        // Android reclaimed it, load the trusted hosted PWA instead of leaving
        // a permanent black surface until the task is force-closed.
        val restored = savedInstanceState?.let { webView.restoreState(it) != null } ?: false
        if (!restored) loadTracker()
    }

    override fun onResume() {
        super.onResume()
        activeActivity = this
        if (::webView.isInitialized) {
            webView.onResume()
            webView.resumeTimers()
            webView.postDelayed({
                if (!isFinishing && !isDestroyed && webView.url.isNullOrBlank()) loadTracker()
                else webView.invalidate()
            }, 350L)
        }
        // Samples can have accumulated while the WebView was backgrounded.
        // They remain encrypted until the trusted page acknowledges them.
        DeliveryLocationService.flushPendingSamples(this)
        if (::webView.isInitialized && isTrustedUri(Uri.parse(webView.url ?: ""))) sendShellReady()
        deliverPendingNativeAction()
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

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        queueActionFromIntent(intent)
        deliverPendingNativeAction()
    }

    override fun onPause() {
        // A phone call or app switch must not suspend the hosted tracker while
        // a native Wear transfer is still reporting progress back to it.
        // Android may background the Activity, but its WebView state is kept.
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
        webReleaseExecutor.shutdownNow()
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
            loadTracker()
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
            "shift_tracker_shell:hello" -> {
                // A trusted PWA handshake proves that the active release
                // reached the bridge. Only this cancels the one-shot startup
                // fallback timer for a newly activated local release.
                expectedLocalReleaseHello = null
                sendShellReady()
                DeliveryLocationService.flushPendingSamples(this)
                bootstrapVerifiedWebRelease()
                // A lightweight discovery check is rate-limited inside the
                // updater; it never downloads or installs anything.
                apkUpdateManager.check(manual = false, installedWebVersion = message.optString("webVersion").takeIf { it.isNotBlank() })
            }
            "shift_tracker_shell:refresh_requested", "shift_tracker_web_update:check" -> checkWebUpdate()
            "shift_tracker_web_update:install" -> installWebUpdate()
            "shift_tracker_web_update:rollback" -> rollbackWebUpdate()
            "shift_tracker_apk_update:check" -> apkUpdateManager.check(message.optBoolean("manual", true), message.optString("webVersion").takeIf { it.isNotBlank() })
            "shift_tracker_apk_update:install" -> apkUpdateManager.downloadAndInstall()
            "shift_tracker_wear_update:check" -> wearUpdateManager.check(message.optBoolean("manual", true))
            "shift_tracker_wear_update:send" -> wearUpdateManager.send()
            "shift_tracker_location:start" -> requestNativeLocationStart(message.optString("deliveryId"))
            "shift_tracker_location:stop" -> stopNativeLocation(message.optString("deliveryId"))
            "shift_tracker_location:background_request" -> requestBackgroundLocation()
            "shift_tracker_store_proof:request" -> requestStoreProofLocation(message.optString("requestId"))
            "shift_tracker_file:save" -> requestNativeFileSave(message)
            "shift_tracker_file:share" -> requestNativeShare(message)
            "shift_tracker_state:sync" -> {
                val snapshot = NativeShiftState.replace(this, message)
                if (snapshot?.shiftActive == true && snapshot.settings.liveNotification && !hasNotificationPermission() && Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), SHIFT_NOTIFICATION_PERMISSION_REQUEST)
                postNativeMessage(JSONObject().put("type", "shift_tracker_state:sync_result").put("accepted", snapshot != null).toString())
            }
            "shift_tracker_state:clear" -> NativeShiftState.clear(this)
            "shift_tracker_native_action:ack" -> NativeShiftState.acknowledgeAction(this, message.optString("id"))
            "shift_tracker_native_action:result" -> {
                val id = message.optString("id")
                val outcome = message.optString("outcome").takeIf { it in setOf("applied", "already_applied", "stale_state", "invalid_action", "error") } ?: "error"
                val pending = NativeShiftState.completeAction(this, id)
                pending?.optString("sourceNodeId")?.takeIf { it.isNotBlank() }?.let { nodeId ->
                    WearSync.reply(this, nodeId, id, outcome, message.optLong("stateRevision", -1L).takeIf { it >= 0L })
                }
                WearSync.publish(this)
            }
            "shift_tracker_rota:sync" -> {
                val count = RotaReminderScheduler.replace(this, message.optJSONArray("reminders") ?: org.json.JSONArray())
                postNativeMessage(JSONObject().put("type", "shift_tracker_rota:sync_result").put("scheduled", count).toString())
            }
            "shift_tracker_rota:request_permission" -> {
                if (Build.VERSION.SDK_INT >= 33 && !hasNotificationPermission()) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), ROTA_NOTIFICATION_PERMISSION_REQUEST)
            }
            "shift_tracker_work:set" -> requestNativeWorkNotification(message)
            "shift_tracker_work:clear" -> {
                pendingWorkNotification = null
                TrackerNotifications.clearWork(this)
            }
            "shift_tracker_geofence:alert" -> {
                val direction = message.optString("direction")
                val observedAt = message.optLong("observedAtEpochMs", 0L)
                if ((direction == "left" || direction == "returned") && observedAt > 0L) TrackerNotifications.showGeofence(this, direction == "returned", observedAt)
            }
            "shift_tracker_location:ack" -> {
                val sampleId = message.optString("sampleId").trim()
                if (sampleId.isNotEmpty() && sampleId.length <= 256) DeliveryLocationService.acknowledgePendingSample(this, sampleId)
            }
        }
    }

    private fun sendShellReady(refreshWearConnection: Boolean = true) {
        val payload = JSONObject().apply {
            put("type", "shift_tracker_shell:ready")
            put("shellVersion", BuildConfig.VERSION_NAME)
            put("bridgeVersion", BRIDGE_VERSION)
            put("trustedOrigin", TRUSTED_ORIGIN)
            put("trackingActive", DeliveryLocationService.isRunning())
            put("trackedDeliveryId", DeliveryLocationService.activeDeliveryId(this@MainActivity) ?: JSONObject.NULL)
            put("diagnostics", nativeDiagnostics())
            webReleaseStore.installed()?.let {
                put("installedWebVersion", it.version)
                put("previousWebVersion", it.previousVersion ?: JSONObject.NULL)
            }
            if (wearConnectionKnown) put("wearConnected", wearConnected)
            WearUpdateManager.version(this@MainActivity)?.let { put("wearVersion", it.first); put("wearVersionCode", it.second) }
        }.toString()
        postNativeMessage(payload)
        deliverPendingNativeAction()
        if (refreshWearConnection) refreshWearConnection()
    }

    /** Presence comes from the Wear Data Layer only. It does not request watch
     * location or create any tracking state. The matching companion version is
     * built and signed with this Android release. */
    private fun refreshWearConnection() {
        Wearable.getNodeClient(this).connectedNodes
            .addOnSuccessListener { nodes ->
                wearConnectionKnown = true
                wearConnected = nodes.isNotEmpty()
                if (wearConnected) WearSync.requestWearVersion(this)
                sendShellReady(refreshWearConnection = false)
            }
            .addOnFailureListener {
                wearConnectionKnown = true
                wearConnected = false
                sendShellReady(refreshWearConnection = false)
            }
    }

    private fun queueActionFromIntent(intent: Intent?) {
        val action = intent?.getStringExtra(NativeActionReceiver.EXTRA_ACTION) ?: return
        NativeShiftState.queueAction(this, action)
        intent.removeExtra(NativeActionReceiver.EXTRA_ACTION)
    }

    private fun deliverPendingNativeAction() {
        val pending = NativeShiftState.peekPendingAction(this) ?: return
        postNativeMessage(JSONObject()
            .put("type", "shift_tracker_native_action:requested")
            .put("id", pending.optString("id"))
            .put("action", pending.optString("action"))
            .put("expectedStateRevision", pending.optLong("expectedStateRevision", -1L))
            .put("expectedShiftId", pending.optString("expectedShiftId"))
            .put("expectedActivityId", pending.optString("expectedActivityId"))
            .toString())
    }

    private fun requestNativeWorkNotification(message: JSONObject) {
        val kind = message.optString("kind")
        val taskId = message.optString("taskId").trim()
        val taskName = message.optString("taskName").trim()
        if ((kind != "cleaning" && kind != "prep") || taskId.isEmpty() || taskId.length > 128 || taskName.isEmpty() || taskName.length > 160) return
        pendingWorkNotification = message.toString()
        if (!hasNotificationPermission()) {
            if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), WORK_NOTIFICATION_PERMISSION_REQUEST)
            return
        }
        showPendingWorkNotification()
    }

    private fun showPendingWorkNotification() {
        val message = pendingWorkNotification?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return
        pendingWorkNotification = null
        val startedAt = message.optLong("startedAtEpochMs", 0L).takeIf { it > 0L }
        TrackerNotifications.showWork(this, message.optString("kind"), message.optString("taskName"), startedAt, message.optBoolean("paused", false))
    }

    private fun selectedUris(data: Intent?): List<Uri> {
        val selected = LinkedHashSet<Uri>()
        data?.clipData?.let { clip ->
            for (index in 0 until clip.itemCount) clip.getItemAt(index).uri?.let(selected::add)
        }
        data?.data?.let(selected::add)
        selected.forEach { uri ->
            runCatching { contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) }
        }
        return selected.toList()
    }

    private fun postNativeMessage(payload: String): Boolean {
        if (!::webView.isInitialized || !isTrustedUri(Uri.parse(webView.url ?: ""))) return false
        return runCatching {
            trustedReplyProxy?.postMessage(payload)
                ?: WebViewCompat.postWebMessage(webView, WebMessageCompat(payload), Uri.parse(TRUSTED_ORIGIN))
        }.isSuccess
    }

    /** Wear Data Layer callbacks arrive on a worker thread. WebView APIs must
     * only be touched from the activity UI thread or Android terminates the
     * phone process just as the watch confirms a received update. */
    private fun postNativeMessageOnUiThread(payload: String): Boolean {
        if (isDestroyed || !::webView.isInitialized) return false
        if (android.os.Looper.myLooper() == android.os.Looper.getMainLooper()) return postNativeMessage(payload)
        webView.post { if (!isDestroyed) postNativeMessage(payload) }
        return true
    }

    /** Web-release work runs on a background executor; WebView replies must
     * always return to its UI thread. */
    private fun postWebUpdate(payload: JSONObject) {
        runOnUiThread {
            if (!isDestroyed) postNativeMessage(payload.toString())
        }
    }

    /** APK updates have their own message channel. They never reuse the Web
     * release store or alter WebView data. */
    private fun postApkUpdate(payload: JSONObject) {
        runOnUiThread {
            if (!isDestroyed) postNativeMessage(payload.toString())
        }
    }

    private fun loadTracker() { webView.loadUrl(TRUSTED_ORIGIN) }

    /** First launch may use the hosted PWA once, then quietly creates the
     * initial verified local copy. Later versions are always user-confirmed. */
    private fun bootstrapVerifiedWebRelease() {
        if (webReleaseStore.installed() != null) return
        webReleaseExecutor.execute {
            webReleaseStore.install { }.also { result ->
                if (result is VerifiedWebReleaseStore.InstallResult.Success) postWebUpdate(JSONObject().put("type", "shift_tracker_web_update:bootstrap_complete").put("webVersion", result.version))
            }
        }
    }

    private fun checkWebUpdate() {
        postWebUpdate(JSONObject().put("type", "shift_tracker_web_update:checking"))
        webReleaseExecutor.execute {
            runCatching { webReleaseStore.check() }.onSuccess { check ->
                postWebUpdate(JSONObject().put("type", "shift_tracker_web_update:available")
                    .put("hostedVersion", check.hostedVersion).put("installedVersion", check.installedVersion ?: JSONObject.NULL)
                    .put("updateAvailable", check.updateAvailable).put("apkVersion", BuildConfig.VERSION_NAME))
            }.onFailure { error -> postWebUpdate(JSONObject().put("type", "shift_tracker_web_update:failed").put("message", error.message ?: "Could not check for a Web Update")) }
        }
