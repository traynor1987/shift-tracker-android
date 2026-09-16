package site.chatgpt.traynor1987.dominosshifttracker

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue
import org.json.JSONObject

class JamesOsWorkBridgeTest {
    @Test fun workEvidenceTargetsTheInstalledJamesOsPackage() {
        assertEquals("uk.co.james.personal", JamesOsWorkBridge.targetPackage())
    }

    @Test fun shiftDeletionUsesAStableProductionRetractionPayload() {
        val payload=JSONObject(JamesOsWorkBridge.retractionPayload("shift-delete-1",42,1_789_000_000_000))
        assertEquals(2,payload.getInt("contractVersion"))
        assertEquals("shift-delete-1:SHIFT_RETRACTED",payload.getString("eventId"))
        assertEquals("SHIFT_RETRACTED",payload.getString("eventType"))
        assertTrue(payload.getBoolean("deleted"))
        assertEquals(42,payload.getLong("revision"))
    }
}
