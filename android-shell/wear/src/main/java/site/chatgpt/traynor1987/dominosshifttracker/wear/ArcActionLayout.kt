package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.content.Context
import android.view.View
import android.view.ViewGroup
import kotlin.math.sqrt

/** Lays native action buttons along the lower curve of a round watch. */
class ArcActionLayout(context: Context) : ViewGroup(context) {
    override fun generateDefaultLayoutParams() = LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT)
    override fun checkLayoutParams(p: LayoutParams?) = p != null
    override fun onMeasure(w:Int,h:Int){ val ww=MeasureSpec.getSize(w); val hh=MeasureSpec.getSize(h); for(i in 0 until childCount)getChildAt(i).measure(MeasureSpec.makeMeasureSpec(72,MeasureSpec.EXACTLY),MeasureSpec.makeMeasureSpec(42,MeasureSpec.EXACTLY)); setMeasuredDimension(ww,hh) }
    override fun onLayout(changed:Boolean,l:Int,t:Int,r:Int,b:Int){ val count=childCount; if(count==0)return; val cx=width/2f; val radius=width*.47f; for(i in 0 until count){val v=getChildAt(i);val x=if(count==1)cx else width*.17f+(width*.66f*i/(count-1)); val dy=sqrt((radius*radius-(x-cx)*(x-cx)).coerceAtLeast(0f)); val y=height-radius+dy-34f; v.layout((x-v.measuredWidth/2).toInt(),y.toInt(),(x+v.measuredWidth/2).toInt(),(y+v.measuredHeight).toInt())} }
}
