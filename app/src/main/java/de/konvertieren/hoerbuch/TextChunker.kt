package de.konvertieren.hoerbuch

/**
 * Teilt beliebig langen Text in Abschnitte auf, die die TTS-Engine
 * verarbeiten kann (Limit meist 4000 Zeichen pro Aufruf).
 * Es wird bevorzugt an Satz- und Absatzgrenzen getrennt.
 */
object TextChunker {

    private val SENTENCE_SPLIT = Regex("(?<=[.!?…])\\s+|\\n+")

    fun split(text: String, maxLen: Int): List<String> {
        val cleaned = text
            .replace("\r\n", "\n")
            .replace(Regex("[ \\t]+"), " ")
            .trim()
        if (cleaned.isEmpty()) return emptyList()

        val sentences = cleaned.split(SENTENCE_SPLIT).filter { it.isNotBlank() }
        val chunks = ArrayList<String>()
        val sb = StringBuilder()

        fun flush() {
            if (sb.isNotBlank()) {
                chunks.add(sb.toString().trim())
                sb.setLength(0)
            }
        }

        for (raw in sentences) {
            val sentence = raw.trim()
            if (sentence.length > maxLen) {
                // Überlanger Einzelsatz: hart an Wortgrenzen trennen.
                flush()
                var start = 0
                while (start < sentence.length) {
                    var end = minOf(start + maxLen, sentence.length)
                    if (end < sentence.length) {
                        val space = sentence.lastIndexOf(' ', end)
                        if (space > start) end = space
                    }
                    chunks.add(sentence.substring(start, end).trim())
                    start = end
                }
                continue
            }
            if (sb.length + sentence.length + 1 > maxLen) flush()
            sb.append(sentence).append(' ')
        }
        flush()
        return chunks
    }
}
