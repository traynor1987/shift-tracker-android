package site.chatgpt.traynor1987.dominosshifttracker

import kotlin.test.Test
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ApkUpdatePolicyTest {
    @Test fun newerVersionCodeIsDetected() = assertTrue(ApkUpdatePolicy.isNewer(28, 27))
    @Test fun sameAndOlderVersionCodesAreNotUpdates() { assertFalse(ApkUpdatePolicy.isNewer(27, 27)); assertFalse(ApkUpdatePolicy.isNewer(26, 27)) }
    @Test fun stableChecksAreRateLimitedButManualChecksAreNot() { assertFalse(ApkUpdatePolicy.shouldCheck(1_000, 2_000, false)); assertTrue(ApkUpdatePolicy.shouldCheck(1_000, 2_000, true)); assertTrue(ApkUpdatePolicy.shouldCheck(0, 2_000, false)) }
    @Test fun digestMustBeCompleteSha256() { assertTrue(ApkUpdatePolicy.isSha256("a".repeat(64))); assertFalse(ApkUpdatePolicy.isSha256("a".repeat(63))); assertFalse(ApkUpdatePolicy.isSha256("z".repeat(64))) }
    @Test fun minimumWebVersionIsDeterministic() { assertTrue(ApkUpdatePolicy.compatibleWithWeb("2.1.129", "2.1.129")); assertTrue(ApkUpdatePolicy.compatibleWithWeb("2.1.130", "2.1.129")); assertFalse(ApkUpdatePolicy.compatibleWithWeb("2.1.128", "2.1.129")); assertFalse(ApkUpdatePolicy.compatibleWithWeb(null, "2.1.129")) }
}
