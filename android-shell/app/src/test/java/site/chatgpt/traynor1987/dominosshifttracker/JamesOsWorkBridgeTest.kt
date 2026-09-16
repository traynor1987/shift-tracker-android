package site.chatgpt.traynor1987.dominosshifttracker

import kotlin.test.Test
import kotlin.test.assertEquals

class JamesOsWorkBridgeTest {
    @Test fun workEvidenceTargetsTheInstalledJamesOsPackage() {
        assertEquals("uk.co.james.personal", JamesOsWorkBridge.targetPackage())
    }
}
