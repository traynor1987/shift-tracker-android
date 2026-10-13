package site.chatgpt.traynor1987.dominosshifttracker

import java.io.File
import kotlin.test.*

/** Explicit protection against restoring destructive session cleanup. */
class JournalEvidenceSourceGuardTest {
    @Test fun startingNewSessionDoesNotDeleteOlderJournalEvidence() {
        val sourceRoot = File(System.getProperty("nativeSourceDirectory", "src/main/java/site/chatgpt/traynor1987/dominosshifttracker"))
        val service = File(sourceRoot, "DeliveryLocationService.kt").readText()
        val store = File(sourceRoot, "NativeSampleStore.kt").readText()
        assertFalse(service.contains("retainDelivery("))
        assertFalse(store.contains("fun retainDelivery("))
        assertFalse(store.contains("fun clear("))
        val replay = service.substringAfter("    fun flushPendingSamples() {").substringBefore("    fun acknowledge(")
        assertTrue(replay.contains("sessionGate.generation == replayGeneration"))
        assertFalse(replay.contains(".deliveryId =="))
    }
}
