package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.content.Context
import android.graphics.*
import android.view.View

/** Display-only round dial; all authoritative work stays on the phone. */
class WearDialView(context: Context) : View(context) {
    var accent: Int = Color.rgb(8, 117, 209); var progress: Float = .5f
    private val p = Paint(Paint.ANTI_ALIAS_FLAG)
    override fun onDraw(c: Canvas) { val r=minOf(width,height)*.475f; val x=width/2f; val y=height/2f
        p.style=Paint.Style.FILL; p.shader=RadialGradient(x,y,r,intArrayOf(Color.rgb(38,34,32),Color.rgb(14,13,13)),null,Shader.TileMode.CLAMP); c.drawCircle(x,y,r,p); p.shader=null
        p.style=Paint.Style.STROKE; p.strokeWidth=10f; p.color=Color.rgb(54,50,47); c.drawCircle(x,y,r-8f,p)
        p.strokeCap=Paint.Cap.ROUND; p.color=accent; c.drawArc(x-r+8f,y-r+8f,x+r-8f,y+r-8f,-90f,progress.coerceIn(.04f,.96f)*360,false,p)
        p.strokeWidth=1.5f; p.color=Color.argb(95,255,253,248); c.drawCircle(x,y,r-24f,p); p.color=Color.argb(80,Color.red(accent),Color.green(accent),Color.blue(accent)); p.strokeWidth=3f; c.drawCircle(x,y,r-34f,p)
    }
}
