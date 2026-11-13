package site.chatgpt.traynor1987.dominosshifttracker

import org.junit.Assert.assertEquals
import org.junit.Test

class ShiftSamplingPolicyTest {
    @Test fun parkedShiftUsesBalancedMode() {
        assertEquals("shift_adaptive", NativeTrackingPolicy.shiftSamplingMode(0.0, 0.0, false))
    }
    @Test fun movingStoreApproachUsesFrequentPreciseFixes() {
        assertEquals("shift_near_store", NativeTrackingPolicy.shiftSamplingMode(200.0, 4.0, false))
        assertEquals("shift_near_store", NativeTrackingPolicy.shiftSamplingMode(200.0, null, false))
    }
    @Test fun distantTravelUsesBoundedBalancedCadence() {
        assertEquals("shift_adaptive", NativeTrackingPolicy.shiftSamplingMode(1000.0, 8.0, false))
    }
    @Test fun explicitHighAccuracyIsPreserved() {
        assertEquals("shift_high_accuracy", NativeTrackingPolicy.shiftSamplingMode(0.0, 0.0, true))
    }
}
