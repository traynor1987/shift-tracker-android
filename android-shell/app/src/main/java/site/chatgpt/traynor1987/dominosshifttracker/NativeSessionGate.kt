package site.chatgpt.traynor1987.dominosshifttracker

/** Identity, rather than wall-clock time, fences pending starts and async work. */
class NativeSessionGate {
    data class Token(val deliveryId: String, val generation: Long)
    @Volatile var current: Token? = null
        private set
    @Volatile var generation = 0L
        private set

    @Synchronized fun restore(deliveryId: String?, savedGeneration: Long) {
        generation = maxOf(generation, savedGeneration)
        current = deliveryId?.let { Token(it, generation) }
    }
    @Synchronized fun begin(deliveryId: String): Token = Token(deliveryId, ++generation).also { current = it }
    fun isCurrent(token: Token): Boolean = current == token
    @Synchronized fun stopTargeted(requestedDeliveryId: String?): Boolean {
        val target = requestedDeliveryId?.trim()?.takeIf { it.isNotEmpty() && it.length <= 128 } ?: return false
        if (current?.deliveryId != target) return false
        stopAll()
        return true
    }
    @Synchronized fun stopAll(): Boolean {
        current = null
        ++generation
        return true
    }
}
