package site.chatgpt.traynor1987.dominosshifttracker

import org.json.JSONObject

/** Store identity is persisted with canonical shift state; unknown profiles fail closed. */
data class NativeStoreProfile(val id: String, val latitude: Double, val longitude: Double, val radius: Double, val verified: Boolean, val revision: String) {
    val identity get() = "$id|$latitude|$longitude|$radius|$verified|$revision"
    fun toJson() = JSONObject().put("id", id).put("latitude", latitude).put("longitude", longitude).put("radius", radius).put("verified", verified).put("revision", revision)
    companion object {
        val ORMSKIRK = NativeStoreProfile("ormskirk", NativeTrackingPolicy.REAL_GEOFENCE_LATITUDE, NativeTrackingPolicy.REAL_GEOFENCE_LONGITUDE, 35.0, true, "protected-v1")
        fun parse(raw: JSONObject?): NativeStoreProfile? {
            if (raw == null || raw.optString("id") == "ormskirk") return ORMSKIRK
            if (raw.optString("id") != "maghull") return null
            val lat = raw.optDouble("latitude", Double.NaN)
            val lon = raw.optDouble("longitude", Double.NaN)
            val radius = raw.optDouble("radius", Double.NaN)
            val revision = raw.optString("revision").take(160)
            val verified = raw.optBoolean("verified", false)
            if (!lat.isFinite() || lat !in -90.0..90.0 || !lon.isFinite() || lon !in -180.0..180.0 || !radius.isFinite() || radius !in (if (verified) 15.0 else 0.0)..200.0 || revision.isBlank()) return null
            return NativeStoreProfile("maghull", lat, lon, radius, verified, revision)
        }
    }
}
