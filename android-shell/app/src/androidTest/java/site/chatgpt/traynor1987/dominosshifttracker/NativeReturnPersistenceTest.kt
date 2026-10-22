package site.chatgpt.traynor1987.dominosshifttracker

import android.content.Context
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONObject

/** Real Android preferences/Keystore; synthetic locations, no Activity or WebView. */
@RunWith(AndroidJUnit4::class)
class NativeReturnPersistenceTest {
    private val context = InstrumentationRegistry.getInstrumentation().targetContext
    private val start = System.currentTimeMillis() - 300_000L
    private fun mirror(id: String = "synthetic-delivery", enabled: Boolean = true, delivered: Int = 2): ShiftSnapshot {
        val raw = JSONObject().put("stateRevision", "synthetic-1").put("shiftId", "synthetic-shift")
            .put("activityId", id).put("shiftActive", true).put("shiftStartedAtEpochMs", start)
            .put("activityStartedAtEpochMs", start).put("activity", "delivery_double")
            .put("requiredCustomers", 2).put("deliveredCustomers", delivered)
            .put("storeExitAtEpochMs", start + 10_000).put("storeExitObserved", true)
            .put("latestDeliveredAtEpochMs", start + 60_000)
            .put("settings", JSONObject().put("liveNotification", false).put("alwaysOnShiftMonitoring", enabled))
        var value: ShiftSnapshot? = null
        InstrumentationRegistry.getInstrumentation().runOnMainSync { value = NativeShiftState.replace(context, raw) }
        return requireNotNull(value)
    }
    private fun point(at: Long = start + 120_000, accuracy: Float = 5f, id: String = "synthetic-delivery") =
        NativeLocationSample("$id:$at", id, 53.56845, -2.88802, at, accuracy, null, null)
    @Before fun prepare() { NativeReturnObserver.clear(context); mirror() }
    @After fun clean() {
        NativeReturnObserver.clear(context)
        context.getSharedPreferences("shift_monitor_v1", Context.MODE_PRIVATE).edit().clear().commit()
        context.getSharedPreferences("shift_tracker_native_mirror_v1", Context.MODE_PRIVATE).edit().clear().commit()
    }
    @Test fun returnWithoutActivitySurvivesObserverRecreation() {
        val value = NativeReturnObserver(context).observe(point(), 7)!!
        assertEquals(point().timestampEpochMs, value.getLong("confirmedAt"))
        assertEquals(0L, value.getLong("exactEntryAt")) // genuine gap, never invented entry
        assertTrue(NativeReturnObserver.hasReturn(context, "synthetic-delivery", 7))
        val restored = NativeReturnObserver(context).observe(point(start + 122_000), 7)!!
        assertEquals(value.getLong("confirmedAt"), restored.getLong("confirmedAt"))
    }
    @Test fun wrongDeliveryCannotWriteObservation() {
        assertNull(NativeReturnObserver(context).observe(point(id="unrelated"), 7))
        assertFalse(NativeReturnObserver.hasReturn(context, "unrelated", 7))
    }
    @Test fun generationCannotRestoreOtherSession() {
        NativeReturnObserver(context).observe(point(), 7)
        assertFalse(NativeReturnObserver.hasReturn(context, "synthetic-delivery", 8))
    }
    @Test fun inaccurateFixCannotConfirm() {
        val value=NativeReturnObserver(context).observe(point(accuracy=66f),7)!!
        assertEquals(0L,value.getLong("confirmedAt"))
    }
    @Test fun doubleOutstandingCannotQueueCompletion() {
        mirror(delivered=1)
        NativeReturnObserver(context).observe(point(),7)
        assertFalse(NativeShiftState.queueObservedReturn(context,"synthetic-shift","synthetic-delivery"))
    }
    @Test fun explicitOptOutClearsMonitoringIdentity() {
        ShiftMonitorController.sync(context, mirror())
        assertEquals("monitor:synthetic-shift", ShiftMonitorController.idleId(context))
        ShiftMonitorController.sync(context, mirror(enabled=false))
        assertNull(ShiftMonitorController.idleId(context))
    }
    @Test fun encryptedJournalPreservesProviderTimestampAndDeduplicates() {
        val sample=point()
        val store=NativeSampleStore(context)
        store.acknowledge(sample.sampleId)
        assertTrue(store.append(sample) is NativeSampleStore.AppendResult.Appended)
        assertTrue(NativeSampleStore(context).append(sample) is NativeSampleStore.AppendResult.AlreadyPresent)
        assertEquals(sample,NativeSampleStore(context).pending().first { it.sampleId==sample.sampleId })
        store.acknowledge(sample.sampleId)
    }
}
