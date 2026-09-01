package site.chatgpt.traynor1987.dominosshifttracker

import android.content.Context
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.ExecutorService

/**
 * Public stable Android updater. It discovers releases from GitHub Releases,
 * downloads only after an explicit PWA request, verifies the SHA-256 and APK
 * identity, then opens Android's normal package installer. It never modifies
 * WebView storage, IndexedDB, app data, or the installed APK itself.
 */
class AndroidApkUpdateManager(
    private val context: Context,
    private val executor: ExecutorService,
    private val emit: (JSONObject) -> Unit,
) {
    companion object {
        private const val RELEASES_URL = "https://api.github.com/repos/traynor1987/shift-tracker-android/releases"
        private const val METADATA_FILE = "shift-tracker-android-release.json"
        private const val PREFS = "shift_tracker_apk_update_v1"
        private const val LAST_SUCCESSFUL_CHECK = "last_successful_check"
        private const val MAX_METADATA_BYTES = 128 * 1024
        private const val MAX_APK_BYTES = 180L * 1024L * 1024L
    }

    private data class Candidate(
        val metadata: ApkUpdatePolicy.Metadata,
        val apkUrl: String,
        val releaseId: Long,
    )

    @Volatile private var candidate: Candidate? = null

    fun check(manual: Boolean, installedWebVersion: String?) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        if (!ApkUpdatePolicy.shouldCheck(prefs.getLong(LAST_SUCCESSFUL_CHECK, 0L), System.currentTimeMillis(), manual)) {
            emit(status("rate_limited").put("message", "Android APK was checked today"))
            return
        }
        emit(status("checking"))
        executor.execute {
            runCatching {
                val remote = discoverStableRelease()
                prefs.edit().putLong(LAST_SUCCESSFUL_CHECK, System.currentTimeMillis()).apply()
                val compatible = ApkUpdatePolicy.compatibleWithWeb(installedWebVersion, remote.metadata.minimumWebVersion)
                candidate = remote
                status(if (ApkUpdatePolicy.isNewer(remote.metadata.versionCode, installedVersionCode()) && compatible) "available" else if (!compatible) "web_refresh_required" else "up_to_date")
                    .put("latestVersion", remote.metadata.versionName)
                    .put("latestVersionCode", remote.metadata.versionCode)
                    .put("minimumWebVersion", remote.metadata.minimumWebVersion ?: JSONObject.NULL)
                    .put("releaseNotes", JSONArray(remote.metadata.releaseNotes))
                    .put("updateAvailable", ApkUpdatePolicy.isNewer(remote.metadata.versionCode, installedVersionCode()) && compatible)
            }.onSuccess(emit).onFailure { error ->
                candidate = null
                emit(status("unavailable").put("message", friendlyMessage(error)))
            }
        }
    }

    fun downloadAndInstall() {
        val selected = candidate
        if (selected == null || !ApkUpdatePolicy.isNewer(selected.metadata.versionCode, installedVersionCode())) {
            emit(status("no_verified_update").put("message", "Check Android APK updates again before downloading."))
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !context.packageManager.canRequestPackageInstalls()) {
            emit(status("install_permission_required").put("message", "Allow Shift Tracker to install updates in Android settings, then try again."))
            context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            return
        }
        emit(status("downloading").put("latestVersion", selected.metadata.versionName))
        executor.execute {
            runCatching {
                val apk = downloadVerified(selected)
                verifyPackageIdentity(apk, selected.metadata)
                openPackageInstaller(apk)
                status("installer_opened").put("latestVersion", selected.metadata.versionName)
            }.onSuccess(emit).onFailure { error ->
                emit(status("failed").put("message", friendlyMessage(error)))
            }
        }
    }

    private fun discoverStableRelease(): Candidate {
        val releases = JSONArray(fetchText(RELEASES_URL, MAX_METADATA_BYTES * 16))
        val release = (0 until releases.length()).asSequence().map { releases.getJSONObject(it) }
            .firstOrNull { !it.optBoolean("draft") && !it.optBoolean("prerelease") }
            ?: error("No stable Android APK release is published yet")
        val assets = release.optJSONArray("assets") ?: error("The stable release has no files")
        val metadataAsset = assetNamed(assets, METADATA_FILE) ?: error("The stable release metadata is missing")
        val metadata = parseMetadata(JSONObject(fetchText(metadataAsset.getString("browser_download_url"), MAX_METADATA_BYTES)))
        val apkAsset = assetNamed(assets, metadata.apkFile) ?: error("The stable release APK is missing")
        val url = apkAsset.optString("browser_download_url")
        require(url.startsWith("https://")) { "The stable release APK link is invalid" }
        return Candidate(metadata, url, release.optLong("id"))
    }

    private fun parseMetadata(raw: JSONObject): ApkUpdatePolicy.Metadata {
        require(raw.optString("channel") == "stable") { "The release is not a stable Android APK" }
        val versionName = raw.optString("versionName")
        val versionCode = raw.optLong("versionCode", -1L)
        val apkFile = raw.optString("apkFile")
        val sha = raw.optString("sha256").lowercase()
        require(versionName.matches(Regex("\\d+\\.\\d+\\.\\d+")) && versionCode > 0 && apkFile.matches(Regex("Shift-Tracker-\\d+\\.\\d+\\.\\d+\\.apk")) && ApkUpdatePolicy.isSha256(sha)) { "The stable release metadata is invalid" }
        require(apkFile == "Shift-Tracker-$versionName.apk") { "The APK name does not match the release version" }
        val notes = raw.optJSONArray("releaseNotes")?.let { list -> (0 until list.length()).mapNotNull { list.optString(it).trim().takeIf(String::isNotBlank) }.take(12) } ?: emptyList()
        return ApkUpdatePolicy.Metadata(versionName, versionCode, raw.optString("minimumWebVersion").trim().takeIf { it.matches(Regex("\\d+\\.\\d+\\.\\d+")) }, apkFile, sha, notes)
    }

    private fun assetNamed(assets: JSONArray, name: String): JSONObject? =
        (0 until assets.length()).asSequence().map { assets.getJSONObject(it) }.firstOrNull { it.optString("name") == name }

    private fun downloadVerified(selected: Candidate): File {
        val directory = File(context.cacheDir, "apk-updates").apply { mkdirs() }
        val temporary = File(directory, ".${selected.metadata.apkFile}.part")
        val final = File(directory, selected.metadata.apkFile)
        temporary.delete(); final.delete()
        try {
            val connection = openConnection(selected.apkUrl)
            connection.inputStream.use { input ->
                val announced = connection.contentLengthLong
                require(announced in 1..MAX_APK_BYTES) { "The APK download is invalid" }
                val digest = MessageDigest.getInstance("SHA-256")
                var total = 0L
                BufferedInputStream(input).use { buffered -> FileOutputStream(temporary).use { output ->
                    val buffer = ByteArray(32 * 1024)
                    while (true) {
                        val read = buffered.read(buffer)
                        if (read < 0) break
                        total += read
                        require(total <= MAX_APK_BYTES) { "The APK download is too large" }
                        digest.update(buffer, 0, read); output.write(buffer, 0, read)
                    }
                } }
                require(total == announced && digest.digest().toHex() == selected.metadata.sha256) { "APK verification failed. The downloaded update was not installed." }
            }
            require(temporary.renameTo(final)) { "The verified APK could not be prepared" }
            return final
        } catch (error: Throwable) { temporary.delete(); final.delete(); throw error }
    }

    private fun verifyPackageIdentity(apk: File, metadata: ApkUpdatePolicy.Metadata) {
        val archive: PackageInfo? = if (Build.VERSION.SDK_INT >= 33) {
            context.packageManager.getPackageArchiveInfo(apk.path, PackageManager.PackageInfoFlags.of(PackageManager.GET_SIGNING_CERTIFICATES.toLong()))
        } else {
            @Suppress("DEPRECATION") context.packageManager.getPackageArchiveInfo(apk.path, PackageManager.GET_SIGNATURES)
        }
        requireNotNull(archive) { "Android could not inspect the verified APK" }
        require(archive.packageName == context.packageName && archive.longVersionCode == metadata.versionCode) { "The verified APK is not the expected Shift Tracker update" }
    }

    private fun openPackageInstaller(apk: File) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apk)
        val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    private fun fetchText(url: String, maxBytes: Int): String {
        val connection = openConnection(url)
        return try {
            val announced = connection.contentLengthLong
            require(announced <= maxBytes) { "The release response is too large" }
            connection.inputStream.use { input ->
                val output = java.io.ByteArrayOutputStream(minOf(maxBytes, 16 * 1024))
                val buffer = ByteArray(16 * 1024)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    require(output.size() + read <= maxBytes) { "The release response is too large" }
                    output.write(buffer, 0, read)
                }
                output.toString(Charsets.UTF_8.name())
            }
        } finally { connection.disconnect() }
    }

    private fun openConnection(address: String): HttpURLConnection {
        require(address.startsWith("https://")) { "Only secure release URLs are allowed" }
        return (URL(address).openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = true; connectTimeout = 15_000; readTimeout = 45_000; requestMethod = "GET"
            setRequestProperty("Accept", "application/vnd.github+json"); setRequestProperty("User-Agent", "Shift-Tracker-Android-Updater")
            require(responseCode == HttpURLConnection.HTTP_OK) { "Could not reach the public Android APK release" }
        }
    }

    private fun installedVersionCode(): Long = if (Build.VERSION.SDK_INT >= 28) packageManagerInfo().longVersionCode else @Suppress("DEPRECATION") packageManagerInfo().versionCode.toLong()
    private fun packageManagerInfo() = context.packageManager.getPackageInfo(context.packageName, 0)
    private fun status(state: String) = JSONObject().put("type", "shift_tracker_apk_update:status").put("state", state).put("installedVersion", BuildConfig.VERSION_NAME).put("installedVersionCode", installedVersionCode())
    private fun ByteArray.toHex() = joinToString("") { "%02x".format(it) }
    private fun friendlyMessage(error: Throwable) = when {
        error.message?.startsWith("APK verification failed") == true -> error.message!!
        error.message?.contains("No stable") == true -> "No public Android APK update is available yet."
        else -> "Could not check or download the Android APK. Your installed app is unchanged."
    }
}
