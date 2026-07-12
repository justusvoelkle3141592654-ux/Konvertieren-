package de.konvertieren.hoerbuch

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import java.io.File

/**
 * Kodiert fortlaufend PCM-Audio (16 Bit) zu einer AAC/M4A-Datei.
 * So entsteht auch bei sehr langen Hörbüchern eine kompakte Datei,
 * ohne dass jemals das gesamte Audio im Speicher liegen muss.
 */
class AacStreamEncoder(
    private val sampleRate: Int,
    private val channels: Int,
    outFile: File,
) {
    private val codec: MediaCodec =
        MediaCodec.createEncoderByType(MediaFormat.MIMETYPE_AUDIO_AAC).apply {
            val format = MediaFormat.createAudioFormat(
                MediaFormat.MIMETYPE_AUDIO_AAC, sampleRate, channels
            )
            format.setInteger(
                MediaFormat.KEY_AAC_PROFILE,
                MediaCodecInfo.CodecProfileLevel.AACObjectLC
            )
            format.setInteger(MediaFormat.KEY_BIT_RATE, 64_000 * channels)
            format.setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 64 * 1024)
            configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
            start()
        }

    private val muxer = MediaMuxer(outFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
    private var trackIndex = -1
    private var muxerStarted = false
    private var totalPcmBytes = 0L
    private val bufferInfo = MediaCodec.BufferInfo()

    private fun presentationTimeUs(pcmBytes: Long): Long =
        pcmBytes * 1_000_000L / (sampleRate.toLong() * channels * 2)

    fun feed(pcm: ByteArray) {
        var offset = 0
        while (offset < pcm.size) {
            val inIdx = codec.dequeueInputBuffer(10_000)
            if (inIdx >= 0) {
                val buf = codec.getInputBuffer(inIdx)!!
                buf.clear()
                val len = minOf(buf.remaining(), pcm.size - offset)
                buf.put(pcm, offset, len)
                codec.queueInputBuffer(inIdx, 0, len, presentationTimeUs(totalPcmBytes), 0)
                totalPcmBytes += len
                offset += len
            }
            drain(untilEos = false)
        }
    }

    fun finish() {
        while (true) {
            val inIdx = codec.dequeueInputBuffer(10_000)
            if (inIdx >= 0) {
                codec.queueInputBuffer(
                    inIdx, 0, 0, presentationTimeUs(totalPcmBytes),
                    MediaCodec.BUFFER_FLAG_END_OF_STREAM
                )
                break
            }
        }
        drain(untilEos = true)
        codec.stop()
        codec.release()
        if (muxerStarted) muxer.stop()
        muxer.release()
    }

    private fun drain(untilEos: Boolean) {
        while (true) {
            val outIdx = codec.dequeueOutputBuffer(bufferInfo, if (untilEos) 10_000 else 0)
            when {
                outIdx == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
                    trackIndex = muxer.addTrack(codec.outputFormat)
                    muxer.start()
                    muxerStarted = true
                }
                outIdx == MediaCodec.INFO_TRY_AGAIN_LATER -> {
                    if (!untilEos) return
                }
                outIdx >= 0 -> {
                    if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) {
                        bufferInfo.size = 0
                    }
                    if (bufferInfo.size > 0 && muxerStarted) {
                        val buf = codec.getOutputBuffer(outIdx)!!
                        buf.position(bufferInfo.offset)
                        buf.limit(bufferInfo.offset + bufferInfo.size)
                        muxer.writeSampleData(trackIndex, buf, bufferInfo)
                    }
                    codec.releaseOutputBuffer(outIdx, false)
                    if (bufferInfo.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) return
                }
            }
        }
    }
}
