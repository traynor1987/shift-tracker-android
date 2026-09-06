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
                            runCatching { NotificationManagerCompat.from(this).notify(RECEIVING_NOTIFICATION, receivingNotification(percent)) }
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
    private lateinit var install: Button

    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)
        onBackPressedDispatcher.addCallback(this, object : androidx.activity.OnBackPressedCallback(true) {
            override fun handleOnBackPressed() { returnToTracker() }
        })
        title = text(18f)
        copy = text(14f)
        progress = android.widget.ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply { max = 100 }
        install = Button(this).apply { text = "INSTALL UPDATE"; setOnClickListener { installUpdate() } }
        val later = Button(this).apply { text = "BACK TO TRACKER"; setOnClickListener {
            returnToTracker()
        } }
        val panel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL
            setPadding(dp(28), dp(34), dp(28), dp(34)); setBackgroundColor(Color.BLACK)
            addView(title); addView(copy)
            addView(progress, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(18)))
            addView(install, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
            addView(later, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        setContentView(android.widget.ScrollView(this).apply { addView(panel) })
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
        title.text = "WATCH UPDATE"
        copy.text = when {
            ready -> "Version ${prefs.getString("transfer_version", "")} is verified.\nDo you want to update?"
            state == "failed" -> "Transfer failed. Retry from your phone."
            !fresh -> "No active transfer. Send the update from your phone."
            state == "verifying" -> "Received 100%\nVerifying update…"
            state == "receiving" -> "Receiving update\n$percent%"
            else -> "Waiting for phone…"
        }
        progress.visibility = if (fresh && !ready) android.view.View.VISIBLE else android.view.View.GONE
        progress.isIndeterminate = state != "receiving"
        progress.progress = percent
        install.visibility = if (ready) android.view.View.VISIBLE else android.view.View.GONE
        install.text = if (!packageManager.canRequestPackageInstalls()) "ALLOW INSTALLS" else "INSTALL UPDATE"
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
        textSize = size; setTextColor(Color.WHITE); gravity = Gravity.CENTER; setPadding(0, dp(6), 0, dp(10))
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
