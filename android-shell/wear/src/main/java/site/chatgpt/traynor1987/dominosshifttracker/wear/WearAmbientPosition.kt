package site.chatgpt.traynor1987.dominosshifttracker.wear

/** Sparse, bounded offsets in dp. A new minute never reuses the previous position. */
object WearAmbientPosition {
    val offsets = listOf(-6 to -4, 0 to -6, 6 to -4, 6 to 3, 0 to 6, -6 to 3, -3 to 0, 3 to 0)
    fun next(previous: Int, choice: Int): Int = if (previous !in offsets.indices) Math.floorMod(choice, offsets.size)
        else (previous + 1 + Math.floorMod(choice, offsets.size - 1)) % offsets.size
}
