package site.chatgpt.traynor1987.dominosshifttracker.wear

import kotlin.math.*

/** Existing lower-arc centers with widths bounded by the round safe area.
 * 48dp touch targets remain the floor; geometry is tested at 192dp and above. */
object WearActionGeometry {
    fun centers(count: Int, width: Float, height: Float): List<Pair<Float, Float>> {
        if (count <= 0) return emptyList()
        if (count == 1) return listOf(width / 2 to height * .78f)
        val radius = min(width, height) * .34f
        val angles = if (count == 2) listOf(118.0, 62.0) else listOf(138.0, 90.0, 42.0)
        return angles.map { angle ->
            val radians = Math.toRadians(angle)
            (width / 2 + cos(radians).toFloat() * radius) to (height * .44f + sin(radians).toFloat() * radius)
        }
    }
    fun buttonWidth(count: Int, width: Float, height: Float, density: Float): Float {
        val desired = when (count) {
            1 -> min(140f * density, width * .58f)
            2 -> min(96f * density, width * .30f)
            else -> min(66f * density, width * .26f)
        }
        val radius = min(width, height) * .48f
        val safeWidth = centers(count, width, height).minOfOrNull { (x, y) ->
            val furthestY = abs(y - height / 2) + 24f * density
            2 * (sqrt((radius * radius - furthestY * furthestY).coerceAtLeast(0f)) - abs(x - width / 2))
        } ?: desired
        return min(desired, safeWidth).coerceAtLeast(48f * density)
    }
}
