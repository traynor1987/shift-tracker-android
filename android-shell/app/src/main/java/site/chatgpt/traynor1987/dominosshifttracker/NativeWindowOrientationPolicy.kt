package site.chatgpt.traynor1987.dominosshifttracker

/** Current window dp, not a cached physical-device classification. The shorter
 * dimension keeps the policy stable across sensor rotation and folding. */
object NativeWindowOrientationPolicy {
    const val EXPANDED_WINDOW_DP = 600
    enum class Mode { PORTRAIT, FULL_SENSOR }
    fun mode(widthDp: Int, heightDp: Int, smallestWidthDp: Int): Mode {
        val shortest = if (widthDp > 0 && heightDp > 0) minOf(widthDp, heightDp) else smallestWidthDp
        return if (shortest >= EXPANDED_WINDOW_DP) Mode.FULL_SENSOR else Mode.PORTRAIT
    }
}
