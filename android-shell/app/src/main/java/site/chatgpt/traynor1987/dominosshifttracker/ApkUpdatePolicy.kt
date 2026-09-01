package site.chatgpt.traynor1987.dominosshifttracker

/** Pure validation and comparison rules for the public stable APK channel.
 * Keeping this separate makes it impossible for a Web App version to be used
 * as the Android update comparator. */
object ApkUpdatePolicy {
    const val CHECK_INTERVAL_MS = 24L * 60L * 60L * 1000L

    data class Metadata(
        val versionName: String,
        val versionCode: Long,
        val minimumWebVersion: String?,
        val apkFile: String,
        val sha256: String,
        val releaseNotes: List<String>,
    )

    fun isNewer(remoteCode: Long, installedCode: Long) = remoteCode > installedCode

    fun shouldCheck(lastSuccessfulCheckMs: Long, nowMs: Long, manual: Boolean) =
        manual || lastSuccessfulCheckMs <= 0L || nowMs - lastSuccessfulCheckMs >= CHECK_INTERVAL_MS

    fun isSha256(value: String) = value.matches(Regex("[a-fA-F0-9]{64}"))

    fun compatibleWithWeb(installedWebVersion: String?, minimumWebVersion: String?): Boolean {
        if (minimumWebVersion.isNullOrBlank()) return true
        if (installedWebVersion.isNullOrBlank()) return false
        return compareSemanticVersions(installedWebVersion, minimumWebVersion) >= 0
    }

    fun compareSemanticVersions(left: String, right: String): Int {
        fun parse(value: String): List<Int>? {
            val pieces = value.trim().split('.')
            if (pieces.isEmpty() || pieces.any { it.isBlank() || it.toIntOrNull() == null }) return null
            return pieces.map { it.toInt() }
        }
        val a = parse(left) ?: return -1
        val b = parse(right) ?: return 1
        for (index in 0 until maxOf(a.size, b.size)) {
            val difference = (a.getOrElse(index) { 0 }).compareTo(b.getOrElse(index) { 0 })
            if (difference != 0) return difference
        }
        return 0
    }
}
