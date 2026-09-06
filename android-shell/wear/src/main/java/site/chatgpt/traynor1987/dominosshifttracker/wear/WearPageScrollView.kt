package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.content.Context
import android.view.View
import android.widget.ScrollView

/** Restore during layout, before drawing, rather than flashing the top in a posted callback. */
class WearPageScrollView(context: Context) : ScrollView(context) {
    private var restorePosition: Int? = null
    fun restoreBeforeDraw(position: Int) {
        restorePosition = position.coerceAtLeast(0)
        requestLayout()
    }
    fun replaceContent(content: View, position: Int) {
        restorePosition = position.coerceAtLeast(0)
        removeAllViews()
        addView(content)
        requestLayout()
    }
    override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
        super.onLayout(changed, left, top, right, bottom)
        restorePosition?.let { scrollTo(0, it); restorePosition = null }
    }
}
