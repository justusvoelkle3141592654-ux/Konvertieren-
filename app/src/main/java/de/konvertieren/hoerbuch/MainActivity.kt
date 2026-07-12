package de.konvertieren.hoerbuch

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.ProgressBar
import android.widget.SeekBar
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.Locale

class MainActivity : AppCompatActivity() {

    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var voices: List<Voice> = emptyList()

    /** Voller Text aus der geladenen Datei (kann sehr groß sein). */
    private var fullText: String = ""
    private var fileLoaded = false
    private var loadedTitle: String = "Hoerbuch"

    private var chunks: List<String> = emptyList()
    private var nextChunk = 0
    private var speaking = false
    private var speechTextHash = 0

    private lateinit var statusText: TextView
    private lateinit var btnPick: Button
    private lateinit var fileInfo: TextView
    private lateinit var btnClear: Button
    private lateinit var editText: EditText
    private lateinit var voiceSpinner: Spinner
    private lateinit var speedLabel: TextView
    private lateinit var speedSeek: SeekBar
    private lateinit var pitchLabel: TextView
    private lateinit var pitchSeek: SeekBar
    private lateinit var btnSpeak: Button
    private lateinit var btnExport: Button
    private lateinit var playProgress: ProgressBar
    private lateinit var progressText: TextView

    private val pickFile =
        registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
            if (uri != null) loadFile(uri)
        }

    private val notifPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {
            startExport()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        bindViews()

        btnPick.setOnClickListener {
            pickFile.launch(arrayOf("application/pdf", "text/*"))
        }
        btnClear.setOnClickListener { clearText() }
        btnSpeak.setOnClickListener { if (speaking) stopSpeaking() else startSpeaking() }
        btnExport.setOnClickListener { requestExport() }

        setupSeekBars()
        setEnabled(false)
        statusText.text = getString(R.string.tts_loading)

        tts = TextToSpeech(this) { status -> runOnUiThread { onTtsInit(status) } }
    }

    private fun bindViews() {
        statusText = findViewById(R.id.statusText)
        btnPick = findViewById(R.id.btnPick)
        fileInfo = findViewById(R.id.fileInfo)
        btnClear = findViewById(R.id.btnClear)
        editText = findViewById(R.id.editText)
        voiceSpinner = findViewById(R.id.voiceSpinner)
        speedLabel = findViewById(R.id.speedLabel)
        speedSeek = findViewById(R.id.speedSeek)
        pitchLabel = findViewById(R.id.pitchLabel)
        pitchSeek = findViewById(R.id.pitchSeek)
        btnSpeak = findViewById(R.id.btnSpeak)
        btnExport = findViewById(R.id.btnExport)
        playProgress = findViewById(R.id.playProgress)
        progressText = findViewById(R.id.progressText)
    }

    // ---------- TTS-Initialisierung ----------

    private fun onTtsInit(status: Int) {
        if (status != TextToSpeech.SUCCESS) {
            statusText.text = getString(R.string.error_tts_init)
            return
        }
        ttsReady = true
        tts?.language = Locale.GERMAN

        voices = runCatching { tts?.voices?.toList() }.getOrNull().orEmpty()
            .sortedWith(
                compareByDescending<Voice> { it.locale.language == Locale.GERMAN.language }
                    .thenByDescending { !it.isNetworkConnectionRequired }
                    .thenByDescending { it.quality }
                    .thenBy { it.name }
            )

        val labels = voices.map { v ->
            val net = if (v.isNetworkConnectionRequired)
                getString(R.string.voice_online) else getString(R.string.voice_offline)
            "${v.locale.displayName} • $net • ${v.name}"
        }
        if (labels.isEmpty()) {
            voiceSpinner.adapter = ArrayAdapter(
                this, android.R.layout.simple_spinner_dropdown_item,
                listOf(getString(R.string.voice_default))
            )
        } else {
            voiceSpinner.adapter = ArrayAdapter(
                this, android.R.layout.simple_spinner_dropdown_item, labels
            )
        }
        voiceSpinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(p: AdapterView<*>?, v: View?, pos: Int, id: Long) {
                applyVoiceSettings()
            }

            override fun onNothingSelected(p: AdapterView<*>?) {}
        }

        statusText.text = getString(R.string.ready)
        setEnabled(true)
    }

    private fun selectedVoice(): Voice? = voices.getOrNull(voiceSpinner.selectedItemPosition)

    private fun currentRate() = 0.5f + speedSeek.progress * 0.05f

    private fun currentPitch() = 0.5f + pitchSeek.progress * 0.05f

    private fun applyVoiceSettings() {
        val engine = tts ?: return
        selectedVoice()?.let { engine.voice = it }
        engine.setSpeechRate(currentRate())
        engine.setPitch(currentPitch())
    }

    private fun setupSeekBars() {
        val listener = object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar?, progress: Int, fromUser: Boolean) {
                speedLabel.text = getString(R.string.speed_label, currentRate())
                pitchLabel.text = getString(R.string.pitch_label, currentPitch())
            }

            override fun onStartTrackingTouch(sb: SeekBar?) {}
            override fun onStopTrackingTouch(sb: SeekBar?) {}
        }
        speedSeek.max = 30
        speedSeek.progress = 10 // 1,0x
        pitchSeek.max = 30
        pitchSeek.progress = 10
        speedSeek.setOnSeekBarChangeListener(listener)
        pitchSeek.setOnSeekBarChangeListener(listener)
        speedLabel.text = getString(R.string.speed_label, 1.0f)
        pitchLabel.text = getString(R.string.pitch_label, 1.0f)
    }

    private fun setEnabled(enabled: Boolean) {
        btnSpeak.isEnabled = enabled
        btnExport.isEnabled = enabled
        voiceSpinner.isEnabled = enabled
    }

    // ---------- Datei laden ----------

    private fun loadFile(uri: Uri) {
        statusText.text = getString(R.string.loading_file)
        lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) {
                runCatching { TextExtractor.extract(this@MainActivity, uri) }
            }
            result.onSuccess { (name, text) ->
                if (text.isBlank()) {
                    statusText.text = getString(R.string.error_empty_file)
                    return@onSuccess
                }
                fullText = text
                fileLoaded = true
                loadedTitle = name.substringBeforeLast('.')
                    .replace(Regex("[^\\p{L}\\p{N} _.-]"), "").ifBlank { "Hoerbuch" }
                nextChunk = 0
                speechTextHash = 0

                val preview = if (text.length > 5000) text.take(5000) + "\n…" else text
                editText.setText(preview)
                editText.isEnabled = false
                fileInfo.text = getString(R.string.file_loaded, name, text.length)
                fileInfo.visibility = View.VISIBLE
                btnClear.visibility = View.VISIBLE
                statusText.text = getString(R.string.ready)
            }.onFailure { e ->
                statusText.text = getString(R.string.error_load, e.message ?: "")
            }
        }
    }

    private fun clearText() {
        stopSpeaking()
        fullText = ""
        fileLoaded = false
        loadedTitle = "Hoerbuch"
        nextChunk = 0
        editText.setText("")
        editText.isEnabled = true
        fileInfo.visibility = View.GONE
        btnClear.visibility = View.GONE
    }

    private fun workingText(): String =
        if (fileLoaded) fullText else editText.text.toString()

    // ---------- Vorlesen ----------

    private fun startSpeaking() {
        val engine = tts ?: return
        if (!ttsReady) return
        val text = workingText().trim()
        if (text.isEmpty()) {
            Toast.makeText(this, R.string.error_no_text, Toast.LENGTH_SHORT).show()
            return
        }

        val maxLen = minOf(3500, TextToSpeech.getMaxSpeechInputLength() - 100)
        if (chunks.isEmpty() || speechTextHash != text.hashCode()) {
            chunks = TextChunker.split(text, maxLen)
            speechTextHash = text.hashCode()
            nextChunk = 0
        }
        if (nextChunk >= chunks.size) nextChunk = 0

        applyVoiceSettings()
        engine.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) {
                val idx = utteranceId?.toIntOrNull() ?: return
                runOnUiThread {
                    nextChunk = idx
                    updatePlayProgress(idx)
                }
            }

            override fun onDone(utteranceId: String?) {
                val idx = utteranceId?.toIntOrNull() ?: return
                if (idx == chunks.size - 1) {
                    runOnUiThread {
                        nextChunk = 0
                        finishSpeakingUi()
                    }
                }
            }

            @Deprecated("Deprecated in Java")
            override fun onError(utteranceId: String?) {
            }
        })

        var queued = TextToSpeech.QUEUE_FLUSH
        for (i in nextChunk until chunks.size) {
            engine.speak(chunks[i], queued, null, i.toString())
            queued = TextToSpeech.QUEUE_ADD
        }
        speaking = true
        btnSpeak.text = getString(R.string.stop)
        playProgress.visibility = View.VISIBLE
        progressText.visibility = View.VISIBLE
        updatePlayProgress(nextChunk)
    }

    private fun updatePlayProgress(idx: Int) {
        playProgress.max = chunks.size
        playProgress.progress = idx + 1
        progressText.text = getString(R.string.play_progress, idx + 1, chunks.size)
    }

    private fun stopSpeaking() {
        tts?.stop()
        finishSpeakingUi()
    }

    private fun finishSpeakingUi() {
        speaking = false
        btnSpeak.text = getString(R.string.speak)
    }

    // ---------- Hörbuch exportieren ----------

    private fun requestExport() {
        if (workingText().isBlank()) {
            Toast.makeText(this, R.string.error_no_text, Toast.LENGTH_SHORT).show()
            return
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED
        ) {
            notifPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            startExport()
        }
    }

    private fun startExport() {
        stopSpeaking()
        val text = workingText().trim()
        if (text.isEmpty()) return

        lifecycleScope.launch {
            val textFile = withContext(Dispatchers.IO) {
                File(cacheDir, "export_text.txt").apply { writeText(text) }
            }
            val intent = Intent(this@MainActivity, AudiobookExportService::class.java).apply {
                putExtra(AudiobookExportService.EXTRA_TEXT_PATH, textFile.absolutePath)
                putExtra(AudiobookExportService.EXTRA_VOICE_NAME, selectedVoice()?.name)
                putExtra(AudiobookExportService.EXTRA_RATE, currentRate())
                putExtra(AudiobookExportService.EXTRA_PITCH, currentPitch())
                putExtra(AudiobookExportService.EXTRA_TITLE, loadedTitle)
            }
            ContextCompat.startForegroundService(this@MainActivity, intent)
            Toast.makeText(this@MainActivity, R.string.export_started, Toast.LENGTH_LONG).show()
        }
    }

    override fun onDestroy() {
        tts?.stop()
        tts?.shutdown()
        super.onDestroy()
    }
}
