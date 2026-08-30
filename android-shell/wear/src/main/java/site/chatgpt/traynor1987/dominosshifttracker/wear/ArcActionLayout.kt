package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.view.View
import android.view.ViewGroup

/** A readable lower action tray, sized for a round watch display. */
class ArcActionLayout(context: Context) : ViewGroup(context) {
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    init { setWillNotDraw(false) }
    override fun generateDefaultLayoutParams() = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
    override fun checkLayoutParams(p: LayoutParams?) = p != null
    private fun buttonWidth(count:Int) = when (count) { 1 -> 164; 2 -> 112; else -> 82 }
    override fun onMeasure(w:Int,h:Int){ val ww=MeasureSpec.getSize(w); val hh=MeasureSpec.getSize(h); val width=buttonWidth(childCount); for(i in 0 until childCount)getChildAt(i).measure(MeasureSpec.makeMeasureSpec(width,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(48,MeasureSpec.EXACTLY)); setMeasuredDimension(ww,hh) }
    override fun onDraw(canvas: Canvas) { if (childCount == 0) return; val y = height - 96f; paint.color = Color.argb(222, 18, 18, 20); canvas.drawRoundRect(RectF(15f, y - 8f, width - 15f, y + 56f), 30f, 30f, paint); paint.style = Paint.Style.STROKE; paint.strokeWidth = 1.5f; paint.color = Color.argb(115, 36, 161, 255); canvas.drawRoundRect(RectF(15f, y - 8f, width - 15f, y + 56f), 30f, 30f, paint); paint.style = Paint.Style.FILL }
    override fun onLayout(changed:Boolean,l:Int,t:Int,r:Int,b:Int){ val count=childCount; if(count==0)return; val width=buttonWidth(count); val gap=6; val total=count*width+(count-1)*gap; var x=(this.width-total)/2; val y=height-92; for(i in 0 until count){val v=getChildAt(i);v.layout(x,y,x+width,y+v.measuredHeight);x+=width+gap} }
}
