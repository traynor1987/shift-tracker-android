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
    private val start = System.currentTimeMillis() - 120_000L
    private fun mirror(id: String = "synthetic-delivery", enabled: Boolean = true, delivered: Int = 2, profile: JSONObject? = null, latestDeliveredAt: Long = start + 60_000): ShiftSnapshot {
        val raw = JSONObject().put("stateRevision", "synthetic-1").put("shiftId", "synthetic-shift")
            .put("activityId", id).put("shiftActive", true).put("shiftStartedAtEpochMs", start)
            .put("activityStartedAtEpochMs", start).put("activity", "delivery_double")
            .put("requiredCustomers", 2).put("deliveredCustomers", delivered)
            .put("storeExitAtEpochMs", start + 10_000).put("storeExitObserved", true)
            .put("latestDeliveredAtEpochMs", latestDeliveredAt)
            .put("settings", JSONObject().put("liveNotification", false).put("alwaysOnShiftMonitoring", enabled))
        profile?.let { raw.put("storeProfile", it) }
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
    @Test fun eventSurvivesRecreationAndAcknowledgesOnlyItsStableIdentity() {
        NativeReturnObserver(context).observe(point(), 7)
        val event = NativeReturnObserver.pendingEvent(context)!!
        assertEquals(point().timestampEpochMs, event.getLong("timestampEpochMs"))
        assertEquals("native_gps", event.getString("source"))
        assertEquals(5.0, event.getDouble("accuracy"), 0.0)
        assertEquals("pending", event.getString("status"))
        NativeReturnObserver(context).observe(point(start + 121_000), 7)
        assertEquals(event.toString(), NativeReturnObserver.pendingEvent(context)!!.toString())
        assertFalse(NativeReturnObserver.acknowledge(context, "wrong-event"))
        assertTrue(NativeReturnObserver.acknowledge(context, event.getString("eventId")))
        assertNull(NativeReturnObserver.pendingEvent(context))
        assertTrue(NativeReturnObserver.hasReturn(context, "synthetic-delivery", 7))
    }
    @Test fun alertRunsAfterPersistenceWithoutActivityAndIsNotRepeated() {
        var alerts = 0
        assertFalse(NativeReturnObserver.postPendingAlert(context) { alerts++; true })
        NativeReturnObserver(context).observe(point(), 7)
        assertTrue(NativeReturnObserver.postPendingAlert(context) { at ->
            assertEquals(point().timestampEpochMs, at)
            assertNotNull(NativeReturnObserver.pendingEvent(context))
            alerts++; true
        })
        assertTrue(NativeReturnObserver.pendingEvent(context)!!.getLong("notificationAt") > 0)
        assertFalse(NativeReturnObserver.postPendingAlert(context) { alerts++; true })
        assertEquals(1, alerts)
    }
    @Test fun disabledNotificationIsRetryable() {
        NativeReturnObserver(context).observe(point(), 7)
        assertFalse(NativeReturnObserver.postPendingAlert(context) { false })
        assertEquals(0L, NativeReturnObserver.pendingEvent(context)!!.getLong("notificationAt"))
        assertTrue(NativeReturnObserver.postPendingAlert(context) { true })
    }
    @Test fun laterDeliveredRequiresFreshReturnEvidence() {
        val first = System.currentTimeMillis() - 1_000
        NativeReturnObserver(context).observe(point(at=first), 7)
        val oldId = NativeReturnObserver.pendingEvent(context)!!.getString("eventId")
        val deliveredAt = System.currentTimeMillis()
        mirror(latestDeliveredAt=deliveredAt)
        assertNull(NativeReturnObserver.pendingEvent(context))
        NativeReturnObserver(context).observe(point(at=deliveredAt + 1), 7)
        val fresh = NativeReturnObserver.pendingEvent(context)!!
        assertTrue(fresh.getLong("observedAtEpochMs") >= deliveredAt)
        assertEquals(0L, fresh.getLong("entryAt"))
        assertNotEquals(oldId, fresh.getString("eventId"))
    }
    @Test fun oldFixCannotCreateEventAfterWorkerDelay() {
        assertNull(NativeReturnObserver(context).observe(point(start + 80_000), 7))
        assertNull(NativeReturnObserver.pendingEvent(context))
    }
    @Test fun eventIsNotExposedToAnotherDeliveryOrShift() {
        NativeReturnObserver(context).observe(point(), 7)
        mirror(id = "another-delivery")
        assertNull(NativeReturnObserver.pendingEvent(context))
    }
    @Test fun returnWithoutActivitySurvivesObserverRecreation() {
        val value = NativeReturnObserver(context).observe(point(), 7)!!
        assertEquals(point().timestampEpochMs, value.getLong("confirmedAt"))
        assertEquals(0L, value.getLong("exactEntryAt")) // genuine gap, never invented entry
        assertTrue(NativeReturnObserver.hasReturn(context, "synthetic-delivery", 7))
        val restored = NativeReturnObserver(context).observe(point(start + 122_000), 7)!!
        assertEquals(value.getLong("confirmedAt"), restored.getLong("confirmedAt"))
    }
    private fun maghull(verified: Boolean, revision: String = "physical-proof-v1") = JSONObject()
        .put("id", "maghull").put("latitude", 53.516605).put("longitude", -2.943185)
        .put("radius", 35).put("verified", verified).put("revision", revision)
    @Test fun provisionalMaghullNeverConfirmsReturn() {
        mirror(profile=maghull(false))
        assertNull(NativeReturnObserver(context).observe(point(), 7))
        assertFalse(NativeShiftState.queueObservedReturn(context,"synthetic-shift","synthetic-delivery"))
    }
    @Test fun selectedMaghullUsesItsOwnCoordinatesAndRestoresIdentity() {
        mirror(profile=maghull(true))
        val wrongStore = NativeReturnObserver(context).observe(point(), 7)!!
        assertEquals(0L, wrongStore.getLong("confirmedAt"))
        val point = NativeLocationSample("maghull", "synthetic-delivery", 53.516605, -2.943185, start+122_000, 5f, null, null)
        assertTrue(NativeReturnObserver(context).observe(point,7)!!.getLong("confirmedAt") > 0)
        assertTrue(NativeReturnObserver.hasReturn(context,"synthetic-delivery",7))
        mirror(profile=maghull(true,"revised-proof"))
        assertFalse(NativeReturnObserver.hasReturn(context,"synthetic-delivery",7))
    }
    @Test fun lateOldProfileCallbackCannotConfirmSelectedStore() {
        mirror(profile=maghull(true))
        assertNull(NativeReturnObserver(context).observe(point(),7,NativeStoreProfile.ORMSKIRK.identity))
        assertFalse(NativeReturnObserver.hasReturn(context,"synthetic-delivery",7))
    }
    @Test fun protectedStoreRejectsCoordinateOverride() {
        assertEquals(NativeStoreProfile.ORMSKIRK, NativeStoreProfile.parse(JSONObject().put("id","ormskirk").put("latitude",0)))
        assertNull(NativeStoreProfile.parse(JSONObject().put("id","maghull")))
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
        assertNull(NativeReturnObserver(context).observe(point(accuracy=66f),7))
    }
    @Test fun doubleOutstandingCannotQueueCompletion() {
        mirror(delivered=1)
        NativeReturnObserver(context).observe(point(),7)
        assertFalse(NativeShiftState.queueObservedReturn(context,"synthetic-shift","synthetic-delivery"))
        assertNull(NativeReturnObserver.pendingEvent(context))
        assertFalse(NativeReturnObserver.postPendingAlert(context) { fail("Outstanding customer must not sound a return alert"); true })
    }
    @Test fun eventLedgerIsBoundedAcrossDeliveries() {
        repeat(70) { index ->
            val id = "synthetic-$index"
            mirror(id=id)
            NativeReturnObserver(context).observe(point(at=System.currentTimeMillis(), id=id), index.toLong())
        }
        assertEquals(64, NativeReturnObserver.diagnostics(context).getInt("nativeReturnEventCount"))
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
