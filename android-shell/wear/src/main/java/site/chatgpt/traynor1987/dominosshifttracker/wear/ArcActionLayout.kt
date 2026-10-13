package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.content.Context
import android.view.ViewGroup

/** Large delivery controls arranged around the lower arc of a round watch. */
class ArcActionLayout(context: Context) : ViewGroup(context) {
    init {
        setWillNotDraw(false)
    }

    override fun generateDefaultLayoutParams() = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
    override fun checkLayoutParams(p: LayoutParams?) = p != null

    private fun dp(value: Float) = value * resources.displayMetrics.density

    private fun buttonHeight() = dp(48f).toInt()

    override fun onMeasure(widthSpec: Int, heightSpec: Int) {
        val measuredWidth = MeasureSpec.getSize(widthSpec)
        val measuredHeight = MeasureSpec.getSize(heightSpec)
        val childWidth = WearActionGeometry.buttonWidth(childCount, measuredWidth.toFloat(), measuredHeight.toFloat(), resources.displayMetrics.density).toInt()
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
        WearActionGeometry.centers(count, width.toFloat(), height.toFloat()).forEachIndexed { index, (centerX, centerY) ->
            val child = getChildAt(index)
            val childLeft = (centerX - child.measuredWidth / 2f).toInt()
            val childTop = (centerY - child.measuredHeight / 2f).toInt()
            child.layout(childLeft, childTop, childLeft + child.measuredWidth, childTop + child.measuredHeight)
        }
    }
}
