package site.chatgpt.traynor1987.dominosshifttracker

import android.content.Context
import android.util.Base64
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Small encrypted recovery journal for active-delivery samples. It is not a
 * second Shift Tracker database: the PWA remains canonical and acknowledges
 * rows after feeding them through its existing ingestion function.
 */
data class NativeLocationSample(
    val sampleId: String,
    val deliveryId: String,
    val latitude: Double,
    val longitude: Double,
    val timestampEpochMs: Long,
    val accuracy: Float,
    val speed: Float?,
    val heading: Float?,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("sampleId", sampleId)
        .put("deliveryId", deliveryId)
        .put("latitude", latitude)
        .put("longitude", longitude)
        .put("timestampEpochMs", timestampEpochMs)
        .put("accuracy", accuracy.toDouble())
        .apply { if (speed != null) put("speed", speed.toDouble()) else put("speed", JSONObject.NULL) }
        .apply { if (heading != null) put("heading", heading.toDouble()) else put("heading", JSONObject.NULL) }

    companion object {
        fun fromJson(value: JSONObject): NativeLocationSample? = runCatching {
            val sampleId = value.getString("sampleId")
            val deliveryId = value.getString("deliveryId")
            val latitude = value.getDouble("latitude")
            val longitude = value.getDouble("longitude")
            val timestamp = value.getLong("timestampEpochMs")
            val accuracy = value.getDouble("accuracy").toFloat()
            val speed = if (value.isNull("speed")) null else value.getDouble("speed").toFloat()
            val heading = if (value.isNull("heading")) null else value.getDouble("heading").toFloat()
            if (sampleId.isBlank() || sampleId.length > 256 || deliveryId.isBlank() || deliveryId.length > 128 || !latitude.isFinite() || latitude < -90 || latitude > 90 || !longitude.isFinite() || longitude < -180 || longitude > 180 || timestamp <= 0 || !accuracy.isFinite() || accuracy < 0f || accuracy > 250f) null
            else NativeLocationSample(sampleId, deliveryId, latitude, longitude, timestamp, accuracy, speed, heading)
        }.getOrNull()
    }
}

class NativeSampleStore(private val context: Context) {
    companion object {
        private const val KEY_ALIAS = "shift_tracker_stage2_gps_key"
        private const val FILE_NAME = "active_delivery_gps.enc"
        private const val MAX_SAMPLES = 20_000
        private const val IV_BYTES = 12
    }

    sealed class AppendResult {
        data class Appended(val sample: NativeLocationSample) : AppendResult()
        data class AlreadyPresent(val sample: NativeLocationSample) : AppendResult()
        data class Failed(val reason: String) : AppendResult()
    }

    private data class ReadResult(
        val samples: List<NativeLocationSample>,
        val failure: String? = null,
    )

    @Synchronized
    fun append(sample: NativeLocationSample): AppendResult {
        val readResult = readResult()
        if (readResult.failure != null) return AppendResult.Failed(readResult.failure)
        readResult.samples.firstOrNull { it.sampleId == sample.sampleId }?.let {
            return AppendResult.AlreadyPresent(it)
        }
        val samples = readResult.samples.toMutableList()
        samples.add(sample)
        while (samples.size > MAX_SAMPLES) samples.removeAt(0)
        return write(samples)?.let { AppendResult.Failed(it) } ?: AppendResult.Appended(sample)
    }

    @Synchronized
    fun pending(): List<NativeLocationSample> = readResult().samples

    @Synchronized
    fun acknowledge(sampleId: String) {
        if (sampleId.isBlank()) return
        val readResult = readResult()
        if (readResult.failure == null) write(readResult.samples.filterNot { it.sampleId == sampleId })
    }

    @Synchronized
    fun clear() {
        atomicFile().delete()
    }

    private fun readResult(): ReadResult {
        val file = atomicFile()
        if (!file.baseFile.exists()) return ReadResult(emptyList())
        return runCatching {
            val encoded = file.openRead().use { it.readBytes() }
            val packed = Base64.decode(encoded, Base64.NO_WRAP)
            if (packed.size <= IV_BYTES) return@runCatching emptyList()
            val iv = packed.copyOfRange(0, IV_BYTES)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            val json = JSONArray(String(cipher.doFinal(packed.copyOfRange(IV_BYTES, packed.size)), Charsets.UTF_8))
            buildList { for (index in 0 until json.length()) NativeLocationSample.fromJson(json.optJSONObject(index) ?: continue)?.let(::add) }
        }.fold(
            onSuccess = { ReadResult(it) },
            onFailure = { ReadResult(emptyList(), failureCode("read", it)) },
        )
    }

    /** Returns null on success or a bounded, non-sensitive diagnostic code. */
    private fun write(samples: List<NativeLocationSample>): String? {
        val file = atomicFile()
        if (samples.isEmpty()) {
            return runCatching { file.delete() }.exceptionOrNull()?.let { failureCode("delete", it) }
        }
        var output: java.io.FileOutputStream? = null
        return try {
            val json = JSONArray().apply { samples.forEach { put(it.toJson()) } }.toString().toByteArray(Charsets.UTF_8)
            val iv = ByteArray(IV_BYTES).also { SecureRandom().nextBytes(it) }
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key(), GCMParameterSpec(128, iv))
            val packed = iv + cipher.doFinal(json)
            val stream = file.startWrite()
            output = stream
            stream.write(Base64.encode(packed, Base64.NO_WRAP))
            file.finishWrite(stream)
            output = null
            null
        } catch (error: Throwable) {
            output?.let(file::failWrite)
            failureCode("write", error)
        }
    }

    private fun atomicFile() = AtomicFile(File(context.filesDir, FILE_NAME))

    private fun failureCode(operation: String, error: Throwable): String {
        val type = error.javaClass.simpleName.lowercase().replace(Regex("[^a-z0-9_]"), "").take(48)
        return "${operation}_${type.ifEmpty { "error" }}"
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (!keyStore.containsAlias(KEY_ALIAS)) {
            val generator = KeyGenerator.getInstance(KeyPropertiesCompat.AES, "AndroidKeyStore")
            generator.init(KeyGenParameterSpecCompat.spec())
            generator.generateKey()
        }
        return (keyStore.getKey(KEY_ALIAS, null) as SecretKey)
    }
}

/** Keystore constants kept here to make the storage class easy to audit. */
private object KeyPropertiesCompat {
    const val AES = "AES"
}

private object KeyGenParameterSpecCompat {
    fun spec(): android.security.keystore.KeyGenParameterSpec =
        android.security.keystore.KeyGenParameterSpec.Builder(
            "shift_tracker_stage2_gps_key",
            android.security.keystore.KeyProperties.PURPOSE_ENCRYPT or android.security.keystore.KeyProperties.PURPOSE_DECRYPT,
        ).setBlockModes(android.security.keystore.KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(android.security.keystore.KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()
}
