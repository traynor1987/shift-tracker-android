package site.chatgpt.traynor1987.dominosshifttracker.wear
import kotlin.test.*

class WearJourneyPolicyTest {
    private val current = WearSnapshot("r", "shift", "run", true, 1000, "delivery_double", "", 2000, 0, "£1", 0, 0, "", "", "", 0, emptyList(), 0, 2, 0, 0, 0, "", "unknown", emptySet(), 3000)
    @Test fun onlyNewCustomerConfirmationInSameRunAlerts() {
        assertTrue(WearJourneyPolicy.confirmation(current, current.copy(deliveredCustomers = 1)))
        assertFalse(WearJourneyPolicy.confirmation(current.copy(deliveredCustomers = 1), current.copy(deliveredCustomers = 1)))
        assertFalse(WearJourneyPolicy.confirmation(current, current.copy(activityId = "other", deliveredCustomers = 1)))
        assertFalse(WearJourneyPolicy.confirmation(current, current.copy(updatedAt = 1000, deliveredCustomers = 1)))
        assertFalse(WearJourneyPolicy.confirmation(current, current.copy(deliveredCustomers = 3)))
    }
    @Test fun onlyClockOutCreatesRecap() {
        assertTrue(WearJourneyPolicy.closedShift(current, current.copy(active = false)))
        assertFalse(WearJourneyPolicy.closedShift(current, current.copy(shiftId = "new")))
        assertFalse(WearJourneyPolicy.closedShift(null, current.copy(active = false)))
        assertFalse(WearJourneyPolicy.closedShift(current.copy(active = false), current.copy(active = false)))
        assertFalse(WearJourneyPolicy.closedShift(current, current.copy(active = false, updatedAt = 1000)))
    }
}
