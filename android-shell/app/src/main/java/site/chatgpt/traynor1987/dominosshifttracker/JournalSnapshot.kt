package site.chatgpt.traynor1987.dominosshifttracker

/** Process-local index over a durable encrypted snapshot. Publish changes only
 * after storage commits. A new process always loads the committed file. The
 * owner serialises access; immutable snapshots prevent replay/ack races. */
class JournalSnapshot<T>(
    private val limit: Int,
    private val identity: (T) -> String,
    private val read: () -> List<T>,
    private val write: (List<T>) -> String?,
) {
    data class Append<T>(val value: T?, val existing: Boolean = false, val failure: String? = null)
    private var rows: LinkedHashMap<String, T>? = null

    private fun loaded(): LinkedHashMap<String, T> = rows ?: LinkedHashMap<String, T>().also { index ->
        read().forEach { index.putIfAbsent(identity(it), it) }
        rows = index
    }
    fun append(value: T): Append<T> = try {
        val current = loaded()
        val id = identity(value)
        val existing = current[id]
        when {
            existing != null -> Append(existing, existing = true)
            current.size >= limit -> Append(null, failure = "capacity_reached")
            else -> {
                val failure = write(current.values.toList() + value)
                if (failure == null) current[id] = value
                Append(if (failure == null) value else null, failure = failure)
            }
        }
    } catch (error: Exception) { Append(null, failure = failureCode(error)) }

    fun pending(): List<T> = loaded().values.toList()
    fun count(): Int = loaded().size
    fun remove(id: String): String? = try {
        if (!loaded().containsKey(id)) null else mutate { it.remove(id) }
    } catch (error: Exception) { failureCode(error) }
    private fun mutate(change: (LinkedHashMap<String, T>) -> Unit): String? = try {
        val current = loaded()
        val next = LinkedHashMap(current).also(change)
        if (next == current) null else write(next.values.toList()).also { if (it == null) rows = next }
    } catch (error: Exception) { failureCode(error) }
    private fun failureCode(error: Exception): String =
        "read_${error.javaClass.simpleName.lowercase().replace(Regex("[^a-z0-9_]"), "").take(48).ifEmpty { "error" }}"
}
