package site.chatgpt.traynor1987.dominosshifttracker.wear

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.view.View

/** Restrained status outline; decorative arc length never implies measured progress. */
class WearDialView(context: Context) : View(context) {
    var accent: Int = Color.rgb(8, 117, 209)
        set(value) { if (field != value) { field = value; invalidate() } }
    var progress: Float = .5f
    var breakFraction: Float? = null
        set(value) { if (field != value) { field = value; invalidate() } }

    private val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    override fun onDraw(canvas: Canvas) {
        val radius = minOf(width, height) * .465f
        val x = width / 2f; val y = height / 2f
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = resources.displayMetrics.density * 1.2f
        paint.color = Color.rgb(35, 39, 45)
        canvas.drawCircle(x, y, radius, paint)
        paint.strokeCap = Paint.Cap.ROUND
        paint.color = Color.argb(170, Color.red(accent), Color.green(accent), Color.blue(accent))
        val fraction = breakFraction
        if (fraction != null) {
            paint.strokeWidth = resources.displayMetrics.density * 3f
            canvas.drawArc(x-radius, y-radius, x+radius, y+radius, -90f, 360f * fraction.coerceIn(0f, 1f), false, paint)
        } else canvas.drawArc(x-radius, y-radius, x+radius, y+radius, 48f, 84f, false, paint)
    }
}
