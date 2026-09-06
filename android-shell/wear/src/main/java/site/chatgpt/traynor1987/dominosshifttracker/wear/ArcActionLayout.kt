package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.view.ViewGroup
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/** Large delivery controls arranged around the lower arc of a round watch. */
class ArcActionLayout(context: Context) : ViewGroup(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)

    init {
        setWillNotDraw(false)
    }

    override fun generateDefaultLayoutParams() = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
    override fun checkLayoutParams(p: LayoutParams?) = p != null

    private fun dp(value: Float) = value * resources.displayMetrics.density

    private fun buttonWidth(count: Int, availableWidth: Int) = when (count) {
        1 -> minOf(dp(140f), availableWidth * .58f)
        2 -> minOf(dp(96f), availableWidth * .40f)
        else -> minOf(dp(66f), availableWidth * .26f)
    }.toInt().coerceAtLeast(dp(48f).toInt())

    private fun buttonHeight() = dp(48f).toInt()

    private fun actionCenters(count: Int): List<Pair<Float, Float>> {
        val centerX = width / 2f
        if (count == 1) return listOf(centerX to height * .78f)
        val radius = min(width, height) * .34f
        val centerY = height * .44f
        val angles = when (count) {
            1 -> listOf(90.0)
            2 -> listOf(118.0, 62.0)
            else -> listOf(138.0, 90.0, 42.0)
        }
        return angles.map { angle ->
            val radians = Math.toRadians(angle)
            (centerX + cos(radians).toFloat() * radius) to
                (centerY + sin(radians).toFloat() * radius)
        }
    }

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val measuredWidth = MeasureSpec.getSize(widthSpec)
        val measuredHeight = MeasureSpec.getSize(heightSpec)
        val childWidth = buttonWidth(childCount, measuredWidth)
        val childHeight = buttonHeight()
        for (index in 0 until childCount) {
            getChildAt(index).measure(
                MeasureSpec.makeMeasureSpec(childWidth, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(childHeight, MeasureSpec.EXACTLY),
            )
        }
        setMeasuredDimension(measuredWidth, measuredHeight)
    }

    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        val count = childCount
        if (count == 0) return
        actionCenters(count).forEachIndexed { index, (centerX, centerY) ->
            val child = getChildAt(index)
            val childLeft = (centerX - child.measuredWidth / 2f).toInt()
            val childTop = (centerY - child.measuredHeight / 2f).toInt()
            child.layout(childLeft, childTop, childLeft + child.measuredWidth, childTop + child.measuredHeight)
        }
    }
}
