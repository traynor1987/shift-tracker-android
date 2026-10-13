package site.chatgpt.traynor1987.dominosshifttracker

import java.io.File
import kotlin.system.measureNanoTime
import kotlin.test.*

/** Deterministic synthetic snapshot storage, not Android Keystore/fsync latency.
 * Runs once in the signed grouped cycle. Timings are descriptive; counts assert
 * avoided decrypt/parse traversals without a flaky timing threshold. */
class JournalBenchmarkTest {
    private class Storage {
        var encoded = (0 until 1_000).joinToString("\n") { "A:$it" }
        var reads = 0
        var decodedRows = 0L
        var writes = 0
        fun read(): List<String> = encoded.lineSequence().filter { it.isNotEmpty() }.toList().also {
            reads++; decodedRows += it.size
        }
        fun write(rows: List<String>): String? { encoded = rows.joinToString("\n"); writes++; return null }
    }
    @Test fun baselineAndCachedSnapshotWorkload() {
        val baseline = Storage()
        val baselineNs = measureNanoTime {
            repeat(100) { n ->
                val rows = baseline.read().toMutableList()
                if (rows.none { it == "A:new$n" }) { rows.add("A:new$n"); baseline.write(rows) }
                baseline.read().size
            }
            repeat(100) { n -> baseline.write(baseline.read().filterNot { it == "A:$n" }); baseline.read().size }
        }
        val optimized = Storage()
        val journal = JournalSnapshot(20_000, { row: String -> row }, optimized::read, optimized::write)
        val optimizedNs = measureNanoTime {
            repeat(100) { n -> assertNull(journal.append("A:new$n").failure); journal.count() }
            repeat(100) { n -> assertNull(journal.remove("A:$n")); journal.count() }
        }
        assertEquals(baseline.encoded, optimized.encoded)
        assertEquals(400, baseline.reads); assertEquals(420_000L, baseline.decodedRows)
        assertEquals(1, optimized.reads); assertEquals(1_000L, optimized.decodedRows)
        assertEquals(200, baseline.writes); assertEquals(200, optimized.writes)
        val report = """{"storage":"deterministic UTF8 fake snapshot; no Android crypto/fsync", "initialRows":1000,"appends":100,"acks":100,"baseline":{"reads":${baseline.reads},"decodedRows":${baseline.decodedRows},"writes":${baseline.writes},"elapsedNs":$baselineNs},"optimized":{"reads":${optimized.reads},"decodedRows":${optimized.decodedRows},"writes":${optimized.writes},"elapsedNs":$optimizedNs}}"""
        File(System.getProperty("journalBenchmarkOutput", "build/reports/journal-benchmark.json")).apply { parentFile.mkdirs(); writeText(report) }
        println("JOURNAL_BENCHMARK $report")
    }
}
