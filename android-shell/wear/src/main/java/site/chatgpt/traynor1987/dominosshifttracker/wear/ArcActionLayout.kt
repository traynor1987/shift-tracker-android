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

    private fun buttonWidth(count: Int) = when (count) {
        1 -> 184
        2 -> 128
        else -> 104
    }

    private fun buttonHeight(count: Int) = if (count == 1) 64 else 60

    private fun actionCenters(count: Int): List<Pair<Float, Float>> {
        val radius = min(width, height) * .34f
        val centerX = width / 2f
        val centerY = height * .47f
        val angles = when (count) {
            1 -> listOf(90.0)
            2 -> listOf(118.0, 62.0)
            else -> listOf(135.0, 90.0, 45.0)
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
        val childWidth = buttonWidth(childCount)
        val childHeight = buttonHeight(childCount)
        for (index in 0 until childCount) {
            getChildAt(index).measure(
                MeasureSpec.makeMeasureSpec(childWidth, MeasureSpec.EXACTLY),
                MeasureSpec.makeMeasureSpec(childHeight, MeasureSpec.EXACTLY),
            )
        }
        setMeasuredDimension(measuredWidth, measuredHeight)
    }

    override fun onDraw(canvas: Canvas) {
        if (childCount == 0) return
        val radius = min(width, height) * .34f
        val centerX = width / 2f
        val centerY = height * .47f
        val arc = RectF(centerX - radius, centerY - radius, centerX + radius, centerY + radius)
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = 2f
        paint.color = Color.argb(135, 36, 161, 255)
        canvas.drawArc(arc, 35f, 110f, false, paint)
        paint.style = Paint.Style.FILL
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
