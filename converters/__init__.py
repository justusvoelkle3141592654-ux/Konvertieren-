"""Zentrale Registry für alle Konvertierungen.

Dieses Modul kennt alle unterstützten Formate, weiß welche Zielformate
für eine Quelldatei sinnvoll sind und leitet Konvertierungen an das
passende Fachmodul weiter. Jede Konvertierung nimmt Bytes entgegen und
gibt Bytes zurück – die UI muss die Fachmodule nie direkt kennen.
"""

from converters.errors import ConversionError

# Kategorien mit ihren Dateiendungen (normalisiert, ohne Punkt, klein)
IMAGE_FORMATS = {"jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff", "tif"}
DOCUMENT_FORMATS = {"pdf", "docx", "txt"}
DATA_FORMATS = {"csv", "xlsx", "json"}
AUDIO_FORMATS = {"mp3", "wav", "ogg", "flac"}
VIDEO_FORMATS = {"mp4", "avi", "mov", "mkv"}

ALL_FORMATS = (
    IMAGE_FORMATS | DOCUMENT_FORMATS | DATA_FORMATS | AUDIO_FORMATS | VIDEO_FORMATS
)

# Endungen, die auf dasselbe Format zeigen – Ziel-Dropdowns zeigen nur die kanonische
_ALIASES = {"jpeg": "jpg", "tif": "tiff"}

CATEGORY_LABELS = {
    "image": "🖼️ Bild",
    "document": "📄 Dokument",
    "data": "📊 Daten/Tabelle",
    "audio": "🎵 Audio",
    "video": "🎬 Video",
}


def normalize_extension(filename_or_ext: str) -> str:
    """Extrahiert die Dateiendung, klein geschrieben, ohne Punkt, Aliasse aufgelöst."""
    ext = filename_or_ext.rsplit(".", 1)[-1].lower().strip()
    return _ALIASES.get(ext, ext)


def detect_category(ext: str) -> str | None:
    """Ordnet eine Dateiendung ihrer Kategorie zu (oder None, wenn unbekannt)."""
    ext = normalize_extension(ext)
    if ext in IMAGE_FORMATS:
        return "image"
    if ext in DOCUMENT_FORMATS:
        return "document"
    if ext in DATA_FORMATS:
        return "data"
    if ext in AUDIO_FORMATS:
        return "audio"
    if ext in VIDEO_FORMATS:
        return "video"
    return None


def get_target_formats(ext: str) -> list[str]:
    """Liefert alle sinnvollen Zielformate für eine Quelldatei.

    Regeln:
    - Innerhalb der eigenen Kategorie: alle anderen Formate der Kategorie.
    - Bilder können zusätzlich als PDF gespeichert werden.
    - Aus Videos kann die Tonspur als Audio extrahiert werden.
    - Dokument-Sonderfälle werden im Dokument-Modul geprüft.
    """
    ext = normalize_extension(ext)
    category = detect_category(ext)
    if category is None:
        return []

    if category == "image":
        targets = {_ALIASES.get(f, f) for f in IMAGE_FORMATS} - {ext}
        targets.add("pdf")
        return sorted(targets)

    if category == "document":
        return sorted(DOCUMENT_FORMATS - {ext})

    if category == "data":
        return sorted(DATA_FORMATS - {ext})

    if category == "audio":
        return sorted(AUDIO_FORMATS - {ext})

    if category == "video":
        video_targets = sorted(VIDEO_FORMATS - {ext})
        audio_targets = sorted(AUDIO_FORMATS)
        return video_targets + audio_targets

    return []


def convert_file(data: bytes, src_ext: str, dst_ext: str) -> bytes:
    """Führt die Konvertierung durch und gibt die Bytes der Zieldatei zurück.

    Wirft ConversionError mit einer nutzerfreundlichen Meldung, wenn etwas
    schiefgeht – die UI fängt diese ab und zeigt sie an.
    """
    src_ext = normalize_extension(src_ext)
    dst_ext = normalize_extension(dst_ext)

    if not data:
        raise ConversionError("Die hochgeladene Datei ist leer.")
    if dst_ext not in get_target_formats(src_ext):
        raise ConversionError(
            f"Die Umwandlung von .{src_ext} nach .{dst_ext} wird nicht unterstützt."
        )

    category = detect_category(src_ext)

    # Fachmodule erst hier importieren, damit ein fehlendes optionales Paket
    # nicht die komplette App am Start hindert.
    if category == "image":
        from converters import image_converter

        return image_converter.convert(data, src_ext, dst_ext)

    if category == "document":
        from converters import document_converter

        return document_converter.convert(data, src_ext, dst_ext)

    if category == "data":
        from converters import data_converter

        return data_converter.convert(data, src_ext, dst_ext)

    if category == "audio":
        from converters import audio_converter

        return audio_converter.convert(data, src_ext, dst_ext)

    if category == "video":
        from converters import video_converter

        return video_converter.convert(data, src_ext, dst_ext)

    raise ConversionError(f"Unbekanntes Dateiformat: .{src_ext}")
