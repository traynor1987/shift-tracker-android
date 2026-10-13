package site.chatgpt.traynor1987.dominosshifttracker.wear

import kotlin.test.*

class WearMainPresenterTest {
    @Test fun actionsKeepPhoneWhitelistAndExistingOrderWithOnePrimary() {
        val items = WearMainPresenter.actions("idle", setOf("single", "double", "break", "unknown"), 0, 0)
        assertEquals(listOf("single", "double", "break"), items.map { it.action })
        assertEquals(listOf("single"), items.filter { it.primary }.map { it.action })
        assertEquals(WearMainPresenter.Tone.RED, items[0].tone)
        assertEquals(WearMainPresenter.Tone.BLUE, items[1].tone)
    }
    @Test fun deliveryAndReturnUseOnlyAvailableNextAction() {
        val items = WearMainPresenter.actions("delivery_double", setOf("back_at_store"), 2, 2)
        assertEquals(listOf("back_at_store"), items.map { it.action })
        assertTrue(items.single().primary)
        assertEquals("DELIVERED 2/2", WearMainPresenter.actions("delivery_double", setOf("delivered"), 1, 2).single().label)
        assertEquals(WearMainPresenter.Tone.RED, WearMainPresenter.actions("delivery_single", setOf("delivered"), 0, 1).single().tone)
    }
    @Test fun resumeChoiceDoesNotIntroduceOtherActions() {
        val items = WearMainPresenter.actions("idle", setOf("resume_task", "dismiss_resume", "single"), 0, 0)
        assertEquals(listOf("resume_task", "dismiss_resume"), items.map { it.action })
        assertTrue(WearMainPresenter.actions("task", emptySet(), 0, 0).isEmpty())
    }
    @Test fun statusShowsAgeAndPreservesRejectedFeedbackWhenStale() {
        assertEquals("Synced 45s ago", WearMainPresenter.status(955_000, null, 1_000_000))
        assertEquals("STALE · Controls paused", WearMainPresenter.status(800_000, null, 1_000_000))
        assertEquals("STATE CHANGED — TRY AGAIN", WearMainPresenter.status(800_000, "stale_state", 1_000_000))
        assertEquals("ACTION NO LONGER AVAILABLE", WearMainPresenter.status(800_000, "invalid_action", 1_000_000))
    }
    @Test fun refreshCrossesStaleBoundaryWithoutWaitingForPhoneMessage() {
        assertEquals(15_000L, WearMainPresenter.refreshDelay(900_000, 1_000_000))
        assertEquals(50L, WearMainPresenter.refreshDelay(880_000, 1_000_000))
        assertEquals(15_000L, WearMainPresenter.refreshDelay(0, 1_000_000))
    }
    @Test fun roundActionWidthsAvoidExistingTwoButtonOverlap() {
        listOf(192f, 216f, 240f).forEach { width ->
            val centers = WearActionGeometry.centers(2, width, width)
            val button = WearActionGeometry.buttonWidth(2, width, width, 1f)
            assertTrue(button >= 48f)
            assertTrue(button < centers[1].first - centers[0].first)
        }
    }
    @Test fun supportedRoundSizesKeepAllButtonCornersInsideSafeCircle() {
        listOf(192f, 216f, 240f).forEach { width ->
            (1..3).forEach { count ->
                val button = WearActionGeometry.buttonWidth(count, width, width, 1f)
                WearActionGeometry.centers(count, width, width).forEach { (x,y) ->
                    listOf(-1, 1).forEach { sx -> listOf(-1, 1).forEach { sy ->
                        val dx = x + sx * button / 2 - width / 2
                        val dy = y + sy * 24 - width / 2
                        assertTrue(dx*dx + dy*dy <= width*width*.48f*.48f + 1f)
                    } }
                }
            }
        }
    }
    @Test fun shippedMainScreenUsesPresenterAndForegroundStaleRefresh() {
        val root = java.io.File(System.getProperty("wearSourceDirectory", "src/main/java/site/chatgpt/traynor1987/dominosshifttracker/wear"))
        val activity = java.io.File(root, "WearMainActivity.kt").readText()
        assertTrue(activity.contains("WearMainPresenter.actions(snapshot.activity, snapshot.actions"))
        assertTrue(activity.contains("WearMainPresenter.status(snapshot.updatedAt, feedback?.outcome)"))
        assertTrue(activity.contains("handler.postDelayed(presentationRefresh"))
        assertTrue(activity.contains("if (snapshot == null || snapshot.disconnected) { render(); return }"))
        assertTrue(java.io.File(root, "ArcActionLayout.kt").readText().contains("WearActionGeometry.buttonWidth("))
    }
}
