"""Universal File Converter – lokale Streamlit-App.

Start:  streamlit run app.py
"""

import mimetypes
from pathlib import Path

import streamlit as st

from converters import (
    ALL_FORMATS,
    CATEGORY_LABELS,
    convert_file,
    detect_category,
    get_target_formats,
    normalize_extension,
)
from converters.errors import ConversionError
from utils.system_check import check_ffmpeg, check_libreoffice, missing_packages

st.set_page_config(
    page_title="Universal File Converter",
    page_icon="🔄",
    layout="centered",
)

MAX_FILE_SIZE_MB = 500


def show_system_status() -> None:
    """Zeigt Warnungen für fehlende Systemvoraussetzungen in der Sidebar."""
    with st.sidebar:
        st.header("⚙️ System-Status")

        missing = missing_packages()
        if missing:
            st.error(
                "Fehlende Python-Pakete: "
                + ", ".join(missing)
                + "\n\nInstallation: `pip install -r requirements.txt`"
            )
        else:
            st.success("Alle Python-Pakete installiert")

        if check_ffmpeg():
            st.success("ffmpeg gefunden – Audio & Video verfügbar")
        else:
            st.warning(
                "**ffmpeg nicht gefunden.**\n\n"
                "Audio- und Video-Konvertierungen sind deaktiviert.\n\n"
                "Installation:\n"
                "- Windows: `winget install ffmpeg`\n"
                "- macOS: `brew install ffmpeg`\n"
                "- Linux: `sudo apt install ffmpeg`"
            )

        if check_libreoffice():
            st.success("LibreOffice gefunden – DOCX → PDF verfügbar")
        else:
            st.info(
                "LibreOffice nicht gefunden. DOCX → PDF benötigt LibreOffice "
                "(oder Microsoft Word auf Windows/macOS)."
            )

        st.divider()
        st.caption(
            "Alle Konvertierungen laufen **lokal** auf deinem Rechner. "
            "Es werden keine Dateien hochgeladen oder ins Internet übertragen."
        )


def guess_mime_type(filename: str) -> str:
    return mimetypes.guess_type(filename)[0] or "unbekannt"


def format_size(num_bytes: int) -> str:
    if num_bytes >= 1024 * 1024:
        return f"{num_bytes / (1024 * 1024):.1f} MB"
    if num_bytes >= 1024:
        return f"{num_bytes / 1024:.1f} KB"
    return f"{num_bytes} Bytes"


def main() -> None:
    st.title("🔄 Universal File Converter")
    st.markdown(
        "Lade eine Datei hoch – das Tool erkennt den Typ automatisch und "
        "zeigt dir alle sinnvollen Zielformate an."
    )

    show_system_status()

    uploaded_file = st.file_uploader(
        "Datei auswählen",
        type=sorted(ALL_FORMATS),
        help=f"Maximale Dateigröße: {MAX_FILE_SIZE_MB} MB",
    )

    if uploaded_file is None:
        st.info(
            "**Unterstützte Formate:**\n\n"
            "- 🖼️ Bilder: JPG, PNG, WEBP, GIF, BMP, TIFF\n"
            "- 📄 Dokumente: PDF, DOCX, TXT\n"
            "- 📊 Daten: CSV, XLSX, JSON\n"
            "- 🎵 Audio: MP3, WAV, OGG, FLAC\n"
            "- 🎬 Video: MP4, AVI, MOV, MKV"
        )
        return

    # --- Dateityp erkennen -------------------------------------------------
    src_ext = normalize_extension(uploaded_file.name)
    category = detect_category(src_ext)

    if category is None:
        st.error(f"Das Format **.{src_ext}** wird leider nicht unterstützt.")
        return

    if uploaded_file.size > MAX_FILE_SIZE_MB * 1024 * 1024:
        st.error(
            f"Die Datei ist zu groß ({format_size(uploaded_file.size)}). "
            f"Maximal erlaubt: {MAX_FILE_SIZE_MB} MB."
        )
        return

    col1, col2, col3 = st.columns(3)
    col1.metric("Kategorie", CATEGORY_LABELS[category])
    col2.metric("Format", f".{src_ext}")
    col3.metric("Größe", format_size(uploaded_file.size))
    st.caption(f"MIME-Type: `{guess_mime_type(uploaded_file.name)}`")

    # --- Zielformat wählen -------------------------------------------------
    targets = get_target_formats(src_ext)

    ffmpeg_needed = category in ("audio", "video")
    if ffmpeg_needed and not check_ffmpeg():
        st.error(
            "Für Audio- und Video-Dateien wird **ffmpeg** benötigt, das auf "
            "diesem System nicht gefunden wurde. Siehe Sidebar für die "
            "Installationsanleitung."
        )
        return

    if not targets:
        st.error(f"Für .{src_ext} sind keine Zielformate verfügbar.")
        return

    dst_ext = st.selectbox(
        "Zielformat auswählen",
        options=targets,
        format_func=lambda ext: f".{ext}  ({CATEGORY_LABELS[detect_category(ext)]})",
    )

    # --- Konvertieren ------------------------------------------------------
    if st.button("🚀 Konvertieren", type="primary", use_container_width=True):
        try:
            data = uploaded_file.getvalue()
            with st.spinner(f"Konvertiere .{src_ext} → .{dst_ext} …"):
                result = convert_file(data, src_ext, dst_ext)
        except ConversionError as exc:
            st.error(f"❌ {exc}")
            return
        except Exception as exc:  # Sicherheitsnetz: die App darf nie abstürzen
            st.error(
                "❌ Unerwarteter Fehler bei der Konvertierung. "
                f"Details: {exc}"
            )
            return

        output_name = f"{Path(uploaded_file.name).stem}.{dst_ext}"
        st.success(
            f"✅ Fertig! **{uploaded_file.name}** wurde nach "
            f"**.{dst_ext}** konvertiert ({format_size(len(result))})."
        )
        st.download_button(
            label=f"⬇️ {output_name} herunterladen",
            data=result,
            file_name=output_name,
            mime=guess_mime_type(output_name),
            type="primary",
            use_container_width=True,
        )


if __name__ == "__main__":
    main()
