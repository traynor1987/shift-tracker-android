package site.chatgpt.traynor1987.dominosshifttracker.wear

object WearJourneyPolicy {
    fun closedShift(previous: WearSnapshot?, next: WearSnapshot) = previous?.active == true &&
        previous.shiftId.isNotBlank() && !next.active && next.updatedAt >= previous.updatedAt
    fun confirmation(previous: WearSnapshot?, next: WearSnapshot): Boolean = previous != null &&
        previous.shiftId == next.shiftId && previous.activityId == next.activityId && next.activityId.isNotBlank() &&
        next.active && next.activity.startsWith("delivery_") && next.updatedAt >= previous.updatedAt &&
        next.deliveredCustomers > previous.deliveredCustomers && next.deliveredCustomers <= next.requiredCustomers
}
