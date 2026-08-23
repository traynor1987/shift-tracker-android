package site.chatgpt.traynor1987.dominosshifttracker

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class NativeTrackingPolicyTest {
    @Test
    fun nearStoreModeIncludesTheProtectedReturnArea() {
        assertEquals(NativeTrackingPolicy.SamplingMode.NEAR_STORE, NativeTrackingPolicy.samplingMode(53.56845, -2.88802))
        assertTrue(NativeTrackingPolicy.distanceMetres(53.56845, -2.88802, 53.56845, -2.88802) < 0.1)
    }

    @Test
    fun ordinaryRouteUsesBatteryConsciousModeUntilApproach() {
        assertEquals(NativeTrackingPolicy.SamplingMode.ROUTE, NativeTrackingPolicy.samplingMode(53.57845, -2.88802))
    }

    @Test
    fun samplingModeUsesHysteresisToAvoidChurnNearTheApproachBoundary() {
        val approximately275MetresNorth = 53.57092
        assertEquals(
            NativeTrackingPolicy.SamplingMode.ROUTE,
            NativeTrackingPolicy.samplingMode(approximately275MetresNorth, -2.88802, NativeTrackingPolicy.SamplingMode.ROUTE),
        )
        assertEquals(
            NativeTrackingPolicy.SamplingMode.NEAR_STORE,
            NativeTrackingPolicy.samplingMode(approximately275MetresNorth, -2.88802, NativeTrackingPolicy.SamplingMode.NEAR_STORE),
        )
    }

    @Test
    fun callbackFromAnOlderDeliverySessionIsRejected() {
        val started = 1_777_000_000_000L
        assertFalse(NativeTrackingPolicy.acceptsProviderTimestamp(started, started - 2_001L))
        assertTrue(NativeTrackingPolicy.acceptsProviderTimestamp(started, started - 2_000L))
        assertTrue(NativeTrackingPolicy.acceptsProviderTimestamp(started, started + 1_000L))
    }
}
