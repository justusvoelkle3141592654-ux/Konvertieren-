package de.konvertieren.hoerbuch

import java.io.File

/** Minimaler WAV-Parser für die von der TTS-Engine erzeugten PCM-Dateien. */
object WavFile {

    class Pcm(
        val sampleRate: Int,
        val channels: Int,
        val bitsPerSample: Int,
        val data: ByteArray,
    )

    fun read(file: File): Pcm {
        val bytes = file.readBytes()
        require(bytes.size >= 44 &&
                bytes.decode(0, 4) == "RIFF" &&
                bytes.decode(8, 4) == "WAVE") { "Keine gültige WAV-Datei" }

        var sampleRate = 0
        var channels = 0
        var bitsPerSample = 16
        var data: ByteArray? = null

        var pos = 12
        while (pos + 8 <= bytes.size) {
            val id = bytes.decode(pos, 4)
            var size = le32(bytes, pos + 4)
            val body = pos + 8
            if (size < 0 || body + size > bytes.size) size = bytes.size - body
            when (id) {
                "fmt " -> {
                    channels = le16(bytes, body + 2)
                    sampleRate = le32(bytes, body + 4)
                    bitsPerSample = le16(bytes, body + 14)
                }
                "data" -> data = bytes.copyOfRange(body, body + size)
            }
            pos = body + size + (size and 1)
        }

        require(sampleRate > 0 && channels > 0) { "WAV-Format nicht lesbar" }
        return Pcm(sampleRate, channels, bitsPerSample, data ?: ByteArray(0))
    }

    private fun ByteArray.decode(offset: Int, len: Int) =
        String(this, offset, len, Charsets.US_ASCII)

    private fun le16(b: ByteArray, o: Int) =
        (b[o].toInt() and 0xFF) or ((b[o + 1].toInt() and 0xFF) shl 8)

    private fun le32(b: ByteArray, o: Int) =
        (b[o].toInt() and 0xFF) or
                ((b[o + 1].toInt() and 0xFF) shl 8) or
                ((b[o + 2].toInt() and 0xFF) shl 16) or
                ((b[o + 3].toInt() and 0xFF) shl 24)
}
