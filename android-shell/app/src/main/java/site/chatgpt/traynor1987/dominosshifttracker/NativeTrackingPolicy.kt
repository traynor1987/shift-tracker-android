package site.chatgpt.traynor1987.dominosshifttracker

import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/** Pure native policy kept free of Android APIs so lifecycle and sampling
 * decisions can be regression-tested on the JVM. */
object NativeTrackingPolicy {
    const val REAL_GEOFENCE_LATITUDE = 53.56845
    const val REAL_GEOFENCE_LONGITUDE = -2.88802
    const val NEAR_STORE_ENTER_METRES = 250.0
    const val NEAR_STORE_EXIT_METRES = 300.0

    enum class SamplingMode { NEAR_STORE, ROUTE }

    fun acceptsProviderTimestamp(sessionStartedAtEpochMs: Long, providerTimestampEpochMs: Long): Boolean =
        providerTimestampEpochMs > 0L && providerTimestampEpochMs >= sessionStartedAtEpochMs - 2_000L

    fun samplingMode(latitude: Double, longitude: Double, currentMode: SamplingMode? = null): SamplingMode {
        val distance = distanceMetres(latitude, longitude, REAL_GEOFENCE_LATITUDE, REAL_GEOFENCE_LONGITUDE)
        val threshold = if (currentMode == SamplingMode.NEAR_STORE) NEAR_STORE_EXIT_METRES else NEAR_STORE_ENTER_METRES
        return if (distance <= threshold) SamplingMode.NEAR_STORE else SamplingMode.ROUTE
    }

    fun distanceMetres(latitude: Double, longitude: Double, targetLatitude: Double, targetLongitude: Double): Double {
        val earthRadius = 6_371_000.0
        val latitudeDelta = Math.toRadians(targetLatitude - latitude)
        val longitudeDelta = Math.toRadians(targetLongitude - longitude)
        val startLatitude = Math.toRadians(latitude)
        val endLatitude = Math.toRadians(targetLatitude)
        val a = sin(latitudeDelta / 2) * sin(latitudeDelta / 2) + cos(startLatitude) * cos(endLatitude) * sin(longitudeDelta / 2) * sin(longitudeDelta / 2)
        return earthRadius * 2 * asin(sqrt(a.coerceIn(0.0, 1.0)))
    }
}
