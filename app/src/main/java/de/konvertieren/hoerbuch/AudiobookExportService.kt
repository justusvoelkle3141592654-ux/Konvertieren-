package de.konvertieren.hoerbuch

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.ContentValues
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.os.IBinder
import android.provider.MediaStore
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import java.io.File
import java.util.Locale
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Wandelt den kompletten Text im Hintergrund in eine M4A-Hörbuchdatei um.
 * Der Text wird abschnittsweise per TTS zu WAV synthetisiert und sofort
 * zu AAC kodiert – so sind auch sehr lange Bücher kein Problem.
 */
class AudiobookExportService : Service() {

    companion object {
        const val EXTRA_TEXT_PATH = "text_path"
        const val EXTRA_VOICE_NAME = "voice_name"
        const val EXTRA_RATE = "rate"
        const val EXTRA_PITCH = "pitch"
        const val EXTRA_TITLE = "title"
        const val ACTION_CANCEL = "de.konvertieren.hoerbuch.CANCEL_EXPORT"

        private const val CHANNEL_ID = "export"
        private const val NOTIF_ID_PROGRESS = 1
        private const val NOTIF_ID_RESULT = 2
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    @Volatile
    private var cancelled = false
    private var tts: TextToSpeech? = null
    private var pendingUtterance: kotlinx.coroutines.CancellableContinuation<Unit>? = null
    private var running = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_CANCEL) {
            cancelled = true
            tts?.stop()
            return START_NOT_STICKY
        }
        if (intent == null || running) return START_NOT_STICKY
        running = true

        createChannel()
        startForeground(NOTIF_ID_PROGRESS, buildProgressNotification(getString(R.string.export_starting), 0, 0))

        val textPath = intent.getStringExtra(EXTRA_TEXT_PATH) ?: return START_NOT_STICKY
        val voiceName = intent.getStringExtra(EXTRA_VOICE_NAME)
        val rate = intent.getFloatExtra(EXTRA_RATE, 1f)
        val pitch = intent.getFloatExtra(EXTRA_PITCH, 1f)
        val title = intent.getStringExtra(EXTRA_TITLE) ?: "Hoerbuch"

        scope.launch {
            try {
                runExport(textPath, voiceName, rate, pitch, title)
            } catch (e: CancellationException) {
                // Vom Nutzer abgebrochen – Benachrichtigung einfach entfernen.
            } catch (e: Exception) {
                showResult(getString(R.string.export_failed, e.message ?: e.javaClass.simpleName), null)
            } finally {
                tts?.shutdown()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        cancelled = true
        scope.cancel()
        super.onDestroy()
    }

    private suspend fun runExport(
        textPath: String,
        voiceName: String?,
        rate: Float,
        pitch: Float,
        title: String,
    ) {
        val text = File(textPath).readText()
        initTts(voiceName, rate, pitch)

        val maxLen = minOf(3500, TextToSpeech.getMaxSpeechInputLength() - 100)
        val chunks = TextChunker.split(text, maxLen)
        if (chunks.isEmpty()) throw IllegalArgumentException(getString(R.string.error_no_text))

        val tmpDir = File(cacheDir, "tts_export").apply {
            deleteRecursively()
            mkdirs()
        }
        val outFile = File(cacheDir, "hoerbuch_out.m4a")
        var encoder: AacStreamEncoder? = null

        try {
            for ((i, chunk) in chunks.withIndex()) {
                if (cancelled) throw CancellationException()
                val wavFile = File(tmpDir, "chunk.wav")
                synthesizeChunk(chunk, wavFile, "chunk_$i")
                val pcm = WavFile.read(wavFile)
                val enc = encoder ?: AacStreamEncoder(pcm.sampleRate, pcm.channels, outFile)
                    .also { encoder = it }
                enc.feed(pcm.data)
                wavFile.delete()
                updateProgress(i + 1, chunks.size)
            }
            encoder?.finish()
            encoder = null

            val uri = saveToMediaStore(outFile, title)
            showResult(getString(R.string.export_done, title), uri)
        } finally {
            runCatching { encoder?.finish() }
            tmpDir.deleteRecursively()
            outFile.delete()
            File(textPath).delete()
        }
    }

    private suspend fun initTts(voiceName: String?, rate: Float, pitch: Float) {
        suspendCancellableCoroutine { cont ->
            tts = TextToSpeech(this) { status ->
                if (status == TextToSpeech.SUCCESS) {
                    cont.resume(Unit)
                } else {
                    cont.resumeWithException(IllegalStateException(getString(R.string.error_tts_init)))
                }
            }
        }
        val engine = tts!!
        engine.language = Locale.GERMAN
        if (voiceName != null) {
            runCatching { engine.voices }.getOrNull()
                ?.firstOrNull { it.name == voiceName }
                ?.let { engine.voice = it }
        }
        engine.setSpeechRate(rate)
        engine.setPitch(pitch)
        engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {}

            override fun onDone(utteranceId: String?) {
                pendingUtterance?.resume(Unit)
                pendingUtterance = null
            }

            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) {
                onError(utteranceId, -1)
            }

            override fun onError(utteranceId: String?, errorCode: Int) {
                pendingUtterance?.resumeWithException(
                    IllegalStateException("TTS-Fehler (Code $errorCode)")
                )
                pendingUtterance = null
            }
        })
    }

    private suspend fun synthesizeChunk(text: String, outFile: File, utteranceId: String) {
        suspendCancellableCoroutine { cont ->
            pendingUtterance = cont
            val result = tts!!.synthesizeToFile(text, Bundle(), outFile, utteranceId)
            if (result != TextToSpeech.SUCCESS) {
                pendingUtterance = null
                cont.resumeWithException(IllegalStateException(getString(R.string.error_tts_synth)))
            }
        }
    }

    private fun saveToMediaStore(src: File, title: String): Uri {
        val values = ContentValues().apply {
            put(MediaStore.Audio.Media.DISPLAY_NAME, "$title.m4a")
            put(MediaStore.Audio.Media.MIME_TYPE, "audio/mp4")
            put(MediaStore.Audio.Media.TITLE, title)
            put(MediaStore.Audio.Media.RELATIVE_PATH, Environment.DIRECTORY_MUSIC + "/Hoerbuecher")
            put(MediaStore.Audio.Media.IS_PENDING, 1)
        }
        val collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        val uri = contentResolver.insert(collection, values)
            ?: throw IllegalStateException(getString(R.string.error_save))
        contentResolver.openOutputStream(uri)!!.use { out ->
            src.inputStream().use { it.copyTo(out) }
        }
        values.clear()
        values.put(MediaStore.Audio.Media.IS_PENDING, 0)
        contentResolver.update(uri, values, null, null)
        return uri
    }

    private fun createChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.notif_channel),
            NotificationManager.IMPORTANCE_LOW
        )
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    private fun buildProgressNotification(text: String, progress: Int, max: Int): Notification {
        val cancelIntent = PendingIntent.getService(
            this, 0,
            Intent(this, AudiobookExportService::class.java).setAction(ACTION_CANCEL),
            PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(text)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setProgress(if (max > 0) max else 0, progress, max == 0)
            .addAction(0, getString(R.string.cancel), cancelIntent)
            .build()
    }

    private fun updateProgress(done: Int, total: Int) {
        val text = getString(R.string.export_progress, done, total)
        getSystemService(NotificationManager::class.java)
            .notify(NOTIF_ID_PROGRESS, buildProgressNotification(text, done, total))
    }

    private fun showResult(message: String, uri: Uri?) {
        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download_done)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setAutoCancel(true)
        if (uri != null) {
            val open = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "audio/mp4")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            builder.setContentIntent(
                PendingIntent.getActivity(this, 1, open, PendingIntent.FLAG_IMMUTABLE)
            )
        }
        getSystemService(NotificationManager::class.java)
            .notify(NOTIF_ID_RESULT, builder.build())
    }
}
