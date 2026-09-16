package site.chatgpt.traynor1987.dominosshifttracker

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class JamesOsWorkBridgeTest {
    @Test fun workEvidenceTargetsTheInstalledJamesOsPackage() {
        assertEquals("uk.co.james.personal", JamesOsWorkBridge.targetPackage())
    }

    @Test fun shiftDeletionUsesAStableProductionRetractionPayload() {
        val payload=JamesOsWorkBridge.retractionPayload("shift-delete-1",42,1_789_000_000_000)
        assertTrue(payload.contains("\"contractVersion\":2"))
        assertTrue(payload.contains("\"eventId\":\"shift-delete-1:SHIFT_RETRACTED\""))
        assertTrue(payload.contains("\"eventType\":\"SHIFT_RETRACTED\""))
        assertTrue(payload.contains("\"deleted\":true"))
        assertTrue(payload.contains("\"revision\":42"))
    }
}
