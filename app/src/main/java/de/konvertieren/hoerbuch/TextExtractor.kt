package de.konvertieren.hoerbuch

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.io.MemoryUsageSetting
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper

/** Liest den reinen Text aus einer PDF- oder Textdatei. */
object TextExtractor {

    /** @return Paar aus Dateiname und extrahiertem Text. */
    fun extract(context: Context, uri: Uri): Pair<String, String> {
        val resolver = context.contentResolver
        val name = displayName(context, uri) ?: "Dokument"
        val isPdf = name.lowercase().endsWith(".pdf") ||
                resolver.getType(uri) == "application/pdf"

        val text = if (isPdf) {
            PDFBoxResourceLoader.init(context.applicationContext)
            resolver.openInputStream(uri)?.use { input ->
                PDDocument.load(input, MemoryUsageSetting.setupTempFileOnly()).use { doc ->
                    val stripper = PDFTextStripper()
                    stripper.sortByPosition = true
                    stripper.getText(doc)
                }
            } ?: ""
        } else {
            resolver.openInputStream(uri)?.use { input ->
                input.readBytes().toString(Charsets.UTF_8)
            } ?: ""
        }
        return name to text
    }

    fun displayName(context: Context, uri: Uri): String? {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
            ?.use { cursor ->
                if (cursor.moveToFirst()) {
                    val idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (idx >= 0) return cursor.getString(idx)
                }
            }
        return uri.lastPathSegment
    }
}
