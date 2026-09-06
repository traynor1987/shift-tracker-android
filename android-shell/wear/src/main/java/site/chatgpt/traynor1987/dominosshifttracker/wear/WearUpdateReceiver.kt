package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.FileProvider
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.ChannelClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.DataInputStream
import java.io.File
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

private const val PREPARE = "/shift-tracker/update/wear/prepare"
private const val STATUS = "/shift-tracker/update/wear/status"
private const val CHANNEL = "/shift-tracker/update/wear/apk"
private const val VERSION = "/shift-tracker/update/wear/version"
private const val UPDATE_CHANNEL = "shift_tracker_updates"
private const val RECEIVING_NOTIFICATION = 226
private const val READY_NOTIFICATION = 227
private const val UPDATE_PREFS = "wear_update"

class WearUpdateReceiver : com.google.android.gms.wearable.WearableListenerService() {
    private val receiving = AtomicBoolean(false)
    private val executor = Executors.newSingleThreadExecutor()

    override fun onMessageReceived(event: MessageEvent) {
        when (event.path) {
            VERSION -> {
                val info = packageManager.getPackageInfo(packageName, 0)
                Wearable.getMessageClient(this).sendMessage(event.sourceNodeId, STATUS, JSONObject()
                    .put("kind", "version")
                    .put("versionName", info.versionName)
                    .put("versionCode", info.longVersionCode)
                    .toString().toByteArray())
            }
            PREPARE -> {
                val raw = event.data.toString(Charsets.UTF_8)
                val meta = runCatching { JSONObject(raw) }.getOrNull() ?: return
                if (receiving.get()) return
                if (!validMetadata(meta)) {
                    WearUpdateStatus.send(this, event.sourceNodeId, "failed", "Wear update metadata was rejected")
                    return
                }
                getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE).getString("ready", null)?.let(::File)?.delete()
                getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE).edit()
                    .remove("ready").remove("ready_code")
                    .putString("meta", meta.toString())
                    .putString("source_node", event.sourceNodeId)
                    .putString("transfer_token", meta.optString("token"))
                    .putString("transfer_version", meta.optString("versionName"))
                    .apply()
                WearUpdateUi.save(this, "waiting", 0)
            }
        }
    }

    override fun onChannelOpened(channel: ChannelClient.Channel) {
        if (channel.path != CHANNEL) return
        if (!receiving.compareAndSet(false, true)) {
            WearUpdateStatus.send(this, channel.nodeId, "failed", "Another watch update is already being received")
            Wearable.getChannelClient(this).close(channel)
            return
        }
        runCatching { startForeground(RECEIVING_NOTIFICATION, receivingNotification()) }
        executor.execute { receive(channel) }
    }

    override fun onDestroy() {
        executor.shutdown()
        super.onDestroy()
    }

    private fun receive(channel: ChannelClient.Channel) {
        val prefs = getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE)
        val meta = runCatching { JSONObject(prefs.getString("meta", null) ?: error("missing metadata")) }.getOrNull()
        val expectedNode = prefs.getString("source_node", null)
        if (meta == null || expectedNode != channel.nodeId || !validMetadata(meta)) {
            WearUpdateUi.save(this, "failed", 0)
            WearUpdateStatus.send(this, channel.nodeId, "failed", "Wear update metadata was missing or expired")
            finishReceive(channel)
            return
        }
        WearUpdateUi.save(this, "receiving", 0)
        WearUpdateStatus.send(this, channel.nodeId, "receiving", "Receiving verified Wear update…")
        val directory = File(cacheDir, "wear-update").apply { mkdirs() }
        val target = File(directory, meta.getString("apkFile"))
        val part = File(directory, ".${target.name}.part")
        part.delete()
        target.delete()
        try {
            val expectedSize = meta.getLong("size")
            require(WearReliabilityPolicy.updateSizeIsAllowed(expectedSize))
            DataInputStream(BufferedInputStream(Tasks.await(Wearable.getChannelClient(this).getInputStream(channel), 30, TimeUnit.SECONDS))).use { input ->
                val headerSize = input.readInt()
                require(headerSize in 2..2048)
                val header = ByteArray(headerSize)
                input.readFully(header)
                require(JSONObject(header.toString(Charsets.UTF_8)).optString("token") == meta.getString("token"))
                val digest = MessageDigest.getInstance("SHA-256")
                var received = 0L
                var reported = -1
                FileOutputStream(part).use { output ->
                    val buffer = ByteArray(32_768)
                    while (true) {
                        val count = input.read(buffer)
                        if (count < 0) break
                        received += count
                        require(received <= expectedSize && received <= WearReliabilityPolicy.MAX_UPDATE_BYTES)
                        digest.update(buffer, 0, count)
                        output.write(buffer, 0, count)
                        val percent = (received * 100 / expectedSize).toInt()
                        if (percent != reported) {
                            reported = percent
                            WearUpdateUi.save(this, "receiving", percent)
                            if (Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                                runCatching { NotificationManagerCompat.from(this).notify(RECEIVING_NOTIFICATION, receivingNotification(percent)) }
                            }
                        }
                    }
                    output.fd.sync()
                }
                require(received == expectedSize)
                require(hex(digest.digest()) == meta.getString("sha256"))
            }
            WearUpdateUi.save(this, "verifying", 100)
            verifyArchive(part, meta.getLong("versionCode"))
            require(part.renameTo(target))
            prefs.getString("ready", null)?.let(::File)?.takeIf { it != target }?.delete()
            prefs.edit()
                .putString("ready", target.path)
                .putLong("ready_code", meta.getLong("versionCode"))
                .remove("meta")
                .apply()
            WearUpdateUi.save(this, "ready", 100)
            runCatching { notifyReady(meta.getString("versionName")) }
            WearUpdateStatus.send(this, channel.nodeId, "ready_to_install", "Wear update ready. Open the watch to install")
        } catch (_: Throwable) {
            WearUpdateUi.save(this, "failed", 0)
            part.delete()
            target.delete()
            prefs.edit().remove("meta").apply()
            WearUpdateStatus.send(this, channel.nodeId, "failed", "Wear update verification failed. Existing app unchanged")
        } finally {
            finishReceive(channel)
        }
    }

    private fun finishReceive(channel: ChannelClient.Channel) {
        Wearable.getChannelClient(this).close(channel)
        receiving.set(false)
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
        stopSelf()
    }

    private fun validMetadata(meta: JSONObject): Boolean {
        val name = meta.optString("versionName")
        val code = meta.optLong("versionCode", 0L)
        val file = meta.optString("apkFile")
        val digest = meta.optString("sha256").lowercase()
        val size = meta.optLong("size", 0L)
        return name.matches(Regex("\\d+\\.\\d+\\.\\d+")) && code > 0L &&
            file == "Shift-Tracker-Wear-$name.apk" && digest.matches(Regex("[a-f0-9]{64}")) &&
            WearReliabilityPolicy.updateSizeIsAllowed(size)
    }

    private fun verifyArchive(file: File, expectedCode: Long) {
        val current = packageManager.getPackageInfoCompat(packageName)
        require(WearReliabilityPolicy.isUpgrade(expectedCode, current.longVersionCode))
        val archive = packageManager.getPackageArchiveInfoCompat(file.path) ?: error("Unreadable APK")
        require(archive.packageName == packageName && archive.longVersionCode == expectedCode)
        val archiveSigners = signerDigests(archive)
        val installedSigners = signerDigests(current)
        require(archiveSigners.isNotEmpty() && archiveSigners == installedSigners)
    }

    private fun PackageManager.getPackageInfoCompat(name: String): PackageInfo =
        if (Build.VERSION.SDK_INT >= 33) getPackageInfo(name, PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong()))
        else @Suppress("DEPRECATION") getPackageInfo(name, PackageManager.GET_SIGNING_CERTIFICATES)

    private fun PackageManager.getPackageArchiveInfoCompat(path: String): PackageInfo? =
        if (Build.VERSION.SDK_INT >= 33) getPackageArchiveInfo(path, PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong()))
        else @Suppress("DEPRECATION") getPackageArchiveInfo(path, PackageManager.GET_SIGNING_CERTIFICATES)

    private fun signerDigests(info: PackageInfo): Set<String> = if (Build.VERSION.SDK_INT >= 28) {
        info.signingInfo?.apkContentsSigners.orEmpty().map { signer ->
            hex(MessageDigest.getInstance("SHA-256").digest(signer.toByteArray()))
        }.toSet()
    } else emptySet()

    private fun receivingNotification(percent: Int = 0): Notification {
        ensureNotificationChannel()
        return NotificationCompat.Builder(this, UPDATE_CHANNEL)
            .setSmallIcon(R.drawable.ic_shift_tracker)
            .setContentTitle("Receiving Shift Tracker update")
            .setContentText("$percent% received · Tap to view")
            .setProgress(100, percent, false)
            .setOnlyAlertOnce(true)
            .setContentIntent(PendingIntent.getActivity(this, RECEIVING_NOTIFICATION,
                Intent(this, WearUpdateActivity::class.java), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun notifyReady(version: String) {
        ensureNotificationChannel()
        val open = PendingIntent.getActivity(this, READY_NOTIFICATION, Intent(this, WearUpdateActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(this, UPDATE_CHANNEL)
            .setSmallIcon(R.drawable.ic_shift_tracker)
            .setContentTitle("Shift Tracker update ready")
            .setContentText("Version $version is ready. Tap to install.")
            .setContentIntent(open)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .build()
        if (Build.VERSION.SDK_INT < 33 || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
            NotificationManagerCompat.from(this).notify(READY_NOTIFICATION, notification)
        }
    }

    private fun ensureNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel(UPDATE_CHANNEL, "Shift Tracker updates", NotificationManager.IMPORTANCE_HIGH))
        }
    }

    private fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it) }
}

object WearUpdateStatus {
    fun send(context: Context, nodeId: String?, state: String, message: String) {
        if (nodeId.isNullOrBlank()) return
        Wearable.getMessageClient(context).sendMessage(nodeId, STATUS, JSONObject()
            .put("state", state)
            .put("message", message)
            .toString().toByteArray())
    }
}

object WearUpdateUi {
    fun save(context: Context, state: String, percent: Int) {
        context.getSharedPreferences(UPDATE_PREFS, Context.MODE_PRIVATE).edit()
            .putString("transfer_state", state).putInt("transfer_percent", percent.coerceIn(0, 100))
            .putLong("transfer_updated", System.currentTimeMillis()).apply()
    }
    fun isVisible(context: Context): Boolean {
        if (hasReadyWearUpdate(context)) return true
        val p = context.getSharedPreferences(UPDATE_PREFS, Context.MODE_PRIVATE)
        return WearReliabilityPolicy.transferIsFresh(p.getString("transfer_state", ""), p.getLong("transfer_updated", 0))
    }
}

/** A deep link opens status only. Installation always requires an explicit tap. */
class WearUpdateActivity : androidx.activity.ComponentActivity() {
    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    private val refresh = object : Runnable {
        override fun run() { render(); handler.postDelayed(this, 1_000L) }
    }
    private lateinit var title: TextView
    private lateinit var copy: TextView
    private lateinit var progress: android.widget.ProgressBar
    private lateinit var install: TextView
    private lateinit var version: TextView
    private lateinit var amount: TextView

    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)
        onBackPressedDispatcher.addCallback(this, object : androidx.activity.OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { returnToTracker() }
        })
        title = text(18f).apply { setTypeface(typeface, android.graphics.Typeface.BOLD) }
        version = text(10f).apply { setTextColor(Color.rgb(164, 172, 183)) }
        copy = text(12f).apply { setTextColor(Color.rgb(196, 201, 209)) }
        amount = text(26f).apply { setTypeface(typeface, android.graphics.Typeface.BOLD) }
        progress = android.widget.ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progressTintList = android.content.res.ColorStateList.valueOf(Color.rgb(35, 161, 255))
            progressBackgroundTintList = android.content.res.ColorStateList.valueOf(Color.rgb(42, 48, 57))
            indeterminateTintList = android.content.res.ColorStateList.valueOf(Color.rgb(35, 161, 255))
        }
        install = action("Install update", true) { installUpdate() }
        val later = action("Back to tracker", false) { returnToTracker() }
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(30), dp(26), dp(30), dp(36)); setBackgroundColor(Color.BLACK)
            addView(android.widget.ImageView(this@WearUpdateActivity).apply {
                setImageResource(R.drawable.ic_shift_tracker)
                contentDescription = "Shift Tracker"
                background = android.graphics.drawable.GradientDrawable().apply { cornerRadius = dp(8).toFloat(); setColor(Color.BLACK) }
                clipToOutline = true
            }, LinearLayout.LayoutParams(dp(30), dp(30)))
            addView(text(11f).apply { text = "SHIFT TRACKER"; setTextColor(Color.rgb(35, 161, 255)); letterSpacing = 0.08f }, row(6))
            addView(version, row(1))
            addView(title, row(8))
            addView(amount, row(2))
            addView(progress, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(8)).apply { topMargin = dp(6); bottomMargin = dp(6) })
            addView(copy, row(4))
            addView(install, row(10))
            addView(later, row(7))
        }
        setContentView(android.widget.ScrollView(this).apply { setBackgroundColor(Color.BLACK); addView(panel) })
    }
    private fun row(top: Int) = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = dp(top) }
    private fun action(label: String, primary: Boolean, onClick: () -> Unit) = TextView(this).apply {
        text = label; textSize = 12f; gravity = Gravity.CENTER
        setTextColor(Color.WHITE); setTypeface(typeface, android.graphics.Typeface.BOLD)
        includeFontPadding = false; minHeight = dp(44)
        setPadding(dp(10), dp(10), dp(10), dp(10))
        val shape = android.graphics.drawable.GradientDrawable().apply {
            cornerRadius = dp(24).toFloat()
            setColor(if (primary) Color.rgb(8, 117, 209) else Color.rgb(30, 35, 43))
            setStroke(dp(1), if (primary) Color.rgb(67, 158, 232) else Color.rgb(68, 76, 88))
        }
        background = android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(Color.argb(55, 255, 255, 255)), shape, null)
        isClickable = true; isFocusable = true
        accessibilityDelegate = object : android.view.View.AccessibilityDelegate() {
            override fun onInitializeAccessibilityNodeInfo(host: android.view.View, info: android.view.accessibility.AccessibilityNodeInfo) {
                super.onInitializeAccessibilityNodeInfo(host, info); info.className = Button::class.java.name
            }
        }
        setOnClickListener { onClick() }
    }

    override fun onResume() { super.onResume(); handler.post(refresh) }
    override fun onPause() { handler.removeCallbacks(refresh); super.onPause() }
    private fun returnToTracker() {
        val prefs = getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE)
        prefs.edit().putString("dismissed_token", prefs.getString("transfer_token", "")).apply()
        startActivity(Intent(this, WearMainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP))
        finish()
    }
    private fun render() {
        val prefs = getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE)
        val ready = hasReadyWearUpdate(this)
        val state = prefs.getString("transfer_state", "")
        val percent = prefs.getInt("transfer_percent", 0).coerceIn(0, 100)
        val fresh = WearUpdateUi.isVisible(this)
        val versionName = prefs.getString("transfer_version", "").orEmpty()
        version.text = if (versionName.isBlank()) "WEAR OS UPDATE" else "WEAR OS  ·  v$versionName"
        val accent = when { ready -> Color.rgb(70, 205, 170); state == "failed" -> Color.rgb(239, 105, 90); else -> Color.rgb(35, 161, 255) }
        title.setTextColor(if (ready || state == "failed") accent else Color.WHITE)
        title.text = when {
            ready -> "Ready to install"
            state == "failed" -> "Transfer interrupted"
            !fresh -> "Watch update"
            state == "verifying" -> "Checking update"
            state == "receiving" -> "Receiving update"
            else -> "Connecting…"
        }
        copy.text = when {
            ready -> "Update verified.\nInstall it now?"
            state == "failed" -> "Send it again from your phone."
            !fresh -> "Start an update from your phone."
            state == "verifying" -> "Received. Checking the file…"
            state == "receiving" -> "You can return to tracking."
            else -> "Waiting for your phone."
        }
        amount.text = "$percent%"
        amount.setTextColor(accent)
        amount.visibility = if (fresh && !ready && state == "receiving") android.view.View.VISIBLE else android.view.View.GONE
        progress.visibility = if (fresh && !ready) android.view.View.VISIBLE else android.view.View.GONE
        progress.isIndeterminate = state != "receiving"
        progress.progress = percent
        progress.contentDescription = if (state == "receiving") "$percent percent received" else "Waiting for update verification"
        install.visibility = if (ready) android.view.View.VISIBLE else android.view.View.GONE
        install.text = if (!packageManager.canRequestPackageInstalls()) "Allow installs" else "Install update"
    }

    private fun installUpdate() {
        if (!hasReadyWearUpdate(this)) { render(); return }
        val prefs = getSharedPreferences(UPDATE_PREFS, MODE_PRIVATE)
        val node = prefs.getString("source_node", null)
        if (!packageManager.canRequestPackageInstalls()) {
            WearUpdateStatus.send(this, node, "install_permission_required", "Allow watch installs, then return to Shift Tracker")
            startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:$packageName")))
            return
        }
        runCatching {
            val file = File(requireNotNull(prefs.getString("ready", null)))
            val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
            startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
            WearUpdateStatus.send(this, node, "installer_opened", "Watch installer opened")
        }.onFailure { WearUpdateStatus.send(this, node, "failed", "Watch installer could not be opened") }
    }
    private fun text(size: Float) = TextView(this).apply {
        textSize = size; setTextColor(Color.WHITE); gravity = Gravity.CENTER; includeFontPadding = false
    }
    private fun dp(value: Int) = (value * resources.displayMetrics.density).toInt().coerceAtLeast(1)
}

fun hasReadyWearUpdate(context: Context): Boolean {
    val prefs = context.getSharedPreferences(UPDATE_PREFS, Context.MODE_PRIVATE)
    val path = prefs.getString("ready", null) ?: return false
    val code = prefs.getLong("ready_code", 0L)
    val current = context.packageManager.getPackageInfo(context.packageName, 0).longVersionCode
    val file = File(path)
    val ready = file.isFile && WearReliabilityPolicy.isUpgrade(code, current)
    if (!ready) {
        file.delete()
        prefs.edit().remove("ready").remove("ready_code").apply()
    }
    return ready
}
