package site.chatgpt.traynor1987.dominosshifttracker

import android.content.Context
import android.webkit.WebResourceResponse
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * Keeps a small, verified local copy of the hosted PWA for the Android shell.
 * It deliberately serves the copy at the same HTTPS URL through WebView's
 * interception layer: IndexedDB and the origin-restricted native bridge remain
 * exactly where they already are. This class owns code files only; it never
 * reads, moves or clears WebView/IndexedDB data.
 */
class VerifiedWebReleaseStore(private val context: Context) {
    companion object {
        const val ORIGIN = "https://dominos-shift-tracker.traynor1987.chatgpt.site"
        private const val MAX_FILE_BYTES = 12 * 1024 * 1024
        private const val MAX_RELEASE_BYTES = 45 * 1024 * 1024
        private const val MAX_FILES = 240
    }

    data class InstalledRelease(val version: String, val previousVersion: String?)
    data class CheckResult(val hostedVersion: String, val installedVersion: String?, val updateAvailable: Boolean)
    data class Progress(val phase: String, val completed: Int, val total: Int)
    sealed class InstallResult {
        data class Success(val version: String) : InstallResult()
        data class Failure(val message: String) : InstallResult()
    }

    private data class ReleaseFile(val path: String, val sha256: String, val bytes: Long, val mimeType: String)
    private data class Manifest(val version: String, val files: List<ReleaseFile>)
    private val root = File(context.filesDir, "verified-web-releases")
    private val stateFile = File(root, "active.json")

    fun installed(): InstalledRelease? = runCatching {
        val state = JSONObject(stateFile.readText())
        InstalledRelease(state.getString("activeVersion"), state.optString("previousVersion").takeIf { it.isNotBlank() })
    }.getOrNull()?.takeIf { releaseDirectory(it.version).isDirectory && File(releaseDirectory(it.version), "entry.html").isFile }

    fun check(): CheckResult {
        val hosted = JSONObject(fetchText("/version.json", 256 * 1024)).getString("webAppVersion")
        require(versionLike(hosted)) { "Published web version is malformed" }
        val local = installed()?.version
        return CheckResult(hosted, local, local == null || compareVersions(hosted, local) > 0)
    }

    /** Runs off the UI thread. A staging folder becomes active only after all
     * file hashes and the entry document have been validated. */
    fun install(progress: (Progress) -> Unit): InstallResult = runCatching {
        root.mkdirs()
        val manifest = fetchManifest()
        val old = installed()?.version
        if (old == manifest.version) return@runCatching InstallResult.Success(manifest.version)
        val stage = File(root, ".staging-${manifest.version}-${System.nanoTime()}")
        stage.mkdirs()
        try {
            progress(Progress("Downloading", 0, manifest.files.size + 1))
            var totalBytes = 0L
            manifest.files.forEachIndexed { index, item ->
                val destination = safeChild(stage, item.path)
                destination.parentFile?.mkdirs()
                downloadVerified(item, destination)
                totalBytes += item.bytes
                require(totalBytes <= MAX_RELEASE_BYTES) { "Web release is too large" }
                progress(Progress("Downloading", index + 1, manifest.files.size + 1))
            }
            val entry = safeChild(stage, "entry.html")
            val html = fetchBytes("/", MAX_FILE_BYTES)
            require(html.toString(Charsets.UTF_8).contains("Shift Tracker", ignoreCase = true)) { "Web release entry page is invalid" }
            entry.writeBytes(html)
            progress(Progress("Verifying", manifest.files.size + 1, manifest.files.size + 1))
            writeTextAtomically(File(stage, "release.json"), JSONObject().apply {
                put("version", manifest.version)
                put("files", JSONArray(manifest.files.map { JSONObject().put("path", it.path).put("sha256", it.sha256).put("mimeType", it.mimeType) }))
            }.toString())
            require(File(stage, "entry.html").isFile) { "Web release entry page is missing" }
            val finalDir = releaseDirectory(manifest.version)
            if (finalDir.exists()) finalDir.deleteRecursively()
            require(stage.renameTo(finalDir)) { "Could not activate staged web release" }
            progress(Progress("Activating", manifest.files.size + 1, manifest.files.size + 1))
            writeTextAtomically(stateFile, JSONObject().apply {
                put("activeVersion", manifest.version)
                if (old != null) put("previousVersion", old)
            }.toString())
            prune(manifest.version, old)
            InstallResult.Success(manifest.version)
        } finally {
            if (stage.exists()) stage.deleteRecursively()
        }
    }.getOrElse { InstallResult.Failure(it.message ?: "The web release could not be verified") }

    fun rollback(): InstalledRelease? {
        val state = installed() ?: return null
        val previous = state.previousVersion ?: return null
        if (!releaseDirectory(previous).isDirectory) return null
        writeTextAtomically(stateFile, JSONObject().put("activeVersion", previous).put("previousVersion", state.version).toString())
        return installed()
    }

    /** Returns only files declared in the active verified manifest. API calls,
     * external links and unknown paths keep using the normal network path. */
    fun localResponse(path: String): WebResourceResponse? {
        val release = installed() ?: return null
        val directory = releaseDirectory(release.version)
        val relative = if (path == "/" || path.isBlank()) "entry.html" else path.removePrefix("/")
        val releaseManifest = runCatching { JSONObject(File(directory, "release.json").readText()) }.getOrNull() ?: return null
        val allowed = relative == "entry.html" || releaseManifest.getJSONArray("files").let { files -> (0 until files.length()).any { files.getJSONObject(it).getString("path") == relative } }
        if (!allowed) return null
        val file = safeChild(directory, relative)
        if (!file.isFile) return null
        val mime = if (relative == "entry.html") "text/html" else mimeFor(relative)
        return WebResourceResponse(mime, "utf-8", BufferedInputStream(FileInputStream(file)))
    }

    private fun fetchManifest(): Manifest {
        val raw = JSONObject(fetchText("/android-web-release.json", 512 * 1024))
        val version = raw.getString("webAppVersion")
        require(versionLike(version)) { "Web release manifest version is malformed" }
        val files = raw.getJSONArray("files")
        require(files.length() in 1..MAX_FILES) { "Web release manifest file count is invalid" }
        val parsed = (0 until files.length()).map { index ->
            val item = files.getJSONObject(index)
            val path = item.getString("path").removePrefix("/")
            val sha = item.getString("sha256").lowercase()
            val bytes = item.getLong("bytes")
            require(pathAllowed(path) && sha.matches(Regex("[0-9a-f]{64}")) && bytes in 1..MAX_FILE_BYTES) { "Web release manifest contains an invalid file" }
            ReleaseFile(path, sha, bytes, item.optString("mimeType", mimeFor(path)))
        }
        require(parsed.map { it.path }.toSet().size == parsed.size) { "Web release manifest repeats a file" }
        return Manifest(version, parsed)
    }

    private fun downloadVerified(item: ReleaseFile, destination: File) {
        val bytes = fetchBytes("/${item.path}", item.bytes.toInt())
        require(bytes.size.toLong() == item.bytes && sha256(bytes) == item.sha256) { "A web release file failed verification" }
        destination.writeBytes(bytes)
    }

    private fun fetchText(path: String, limit: Int) = fetchBytes(path, limit).toString(Charsets.UTF_8)
    private fun fetchBytes(path: String, limit: Int): ByteArray {
        val connection = (URL("$ORIGIN$path").openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false; connectTimeout = 15_000; readTimeout = 30_000; requestMethod = "GET"; setRequestProperty("Cache-Control", "no-cache")
        }
        try {
            val response = connection
            require(response.responseCode == HttpURLConnection.HTTP_OK) { "Published web release download failed" }
            val expected = response.contentLengthLong
            require(expected <= limit) { "Published web release file is too large" }
            response.inputStream.use { input ->
                val output = ByteArrayOutputStream(minOf(limit, 64 * 1024))
                val buffer = ByteArray(16 * 1024)
                while (true) {
                    val read = input.read(buffer)
                    if (read < 0) break
                    require(output.size() + read <= limit) { "Published web release file is too large" }
                    output.write(buffer, 0, read)
                }
                output.toByteArray()
            }
        } finally { connection.disconnect() }
    }
    private fun safeChild(parent: File, relative: String): File {
        require(pathAllowed(relative)) { "Unsafe web release file path" }
        val child = File(parent, relative).canonicalFile
        require(child.path.startsWith(parent.canonicalPath + File.separator)) { "Unsafe web release file path" }
        return child
    }
    private fun pathAllowed(path: String) = path.isNotBlank() && !path.contains("..") && path.matches(Regex("[A-Za-z0-9._/-]+")) && !path.startsWith("/")
    private fun releaseDirectory(version: String) = File(root, version)
    private fun writeTextAtomically(file: File, text: String) { file.parentFile?.mkdirs(); val temporary = File(file.parentFile, ".${file.name}.tmp"); temporary.writeText(text); require(temporary.renameTo(file)) { "Could not save web release state" } }
    private fun prune(active: String, previous: String?) { root.listFiles()?.filter { it.isDirectory && it.name != active && it.name != previous && !it.name.startsWith(".staging-") }?.forEach { it.deleteRecursively() } }
    private fun sha256(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
    private fun versionLike(value: String) = value.matches(Regex("\\d+\\.\\d+\\.\\d+"))
    private fun compareVersions(left: String, right: String): Int = left.split('.').map(String::toInt).zip(right.split('.').map(String::toInt)).firstOrNull { it.first != it.second }?.let { it.first.compareTo(it.second) } ?: 0
    private fun mimeFor(path: String) = when { path.endsWith(".js") -> "text/javascript"; path.endsWith(".css") -> "text/css"; path.endsWith(".json") || path.endsWith(".webmanifest") -> "application/json"; path.endsWith(".svg") -> "image/svg+xml"; path.endsWith(".png") -> "image/png"; path.endsWith(".woff2") -> "font/woff2"; else -> "application/octet-stream" }
}
