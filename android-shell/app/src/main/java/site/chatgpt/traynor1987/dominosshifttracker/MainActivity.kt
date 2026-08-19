package site.chatgpt.traynor1987.dominosshifttracker

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
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

        @Volatile
        private var activeActivity: MainActivity? = null

        /** Only the currently visible, exact-origin activity can receive data. */
        fun sendNativeMessage(payload: String) {
            activeActivity?.postNativeMessage(payload)
        }
    }

    private lateinit var webView: WebView
    private var pendingStartDeliveryId: String? = null

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
        val missing = requiredRuntimePermissions().filterNot(::hasPermission).toTypedArray()
        if (missing.isNotEmpty()) {
            requestPermissions(missing, LOCATION_PERMISSION_REQUEST)
            sendNativeState("permission_required", deliveryId, "Precise location and notification permission are required for delivery tracking")
            return
        }
        startNativeLocationService(deliveryId)
    }

    private fun startNativeLocationService(deliveryId: String) {
        pendingStartDeliveryId = null
        val intent = Intent(this, DeliveryLocationService::class.java)
            .setAction(DeliveryLocationService.ACTION_START)
            .putExtra(DeliveryLocationService.EXTRA_DELIVERY_ID, deliveryId)
        runCatching { startForegroundService(this, intent) }
            .onFailure { sendNativeState("error", deliveryId, "Android could not start the delivery GPS service") }
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
        val payload = JSONObject()
            .put("type", "shift_tracker_location:state")
            .put("status", status)
            .apply { if (!deliveryId.isNullOrBlank()) put("deliveryId", deliveryId) }
            .apply { if (!message.isNullOrBlank()) put("message", message) }
            .toString()
        postNativeMessage(payload)
    }

    private fun requiredRuntimePermissions(): List<String> = buildList {
        add(Manifest.permission.ACCESS_FINE_LOCATION)
        add(Manifest.permission.ACCESS_COARSE_LOCATION)
        if (android.os.Build.VERSION.SDK_INT >= 33) add(Manifest.permission.POST_NOTIFICATIONS)
    }

    private fun hasPermission(permission: String) = ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != LOCATION_PERMISSION_REQUEST) return
        val deliveryId = pendingStartDeliveryId ?: return
        if (requiredRuntimePermissions().all(::hasPermission)) startNativeLocationService(deliveryId)
        else {
            pendingStartDeliveryId = null
            sendNativeState("permission_required", deliveryId, "Precise location and notification permission are required for delivery tracking")
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
