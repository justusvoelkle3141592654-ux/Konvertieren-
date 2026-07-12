# 🔄 Universal File Converter

Ein lokales, universelles Dateikonvertierungs-Tool mit moderner Web-Oberfläche
(Streamlit). Alle Konvertierungen laufen **offline auf deinem Rechner** – keine
Upload-Limits, keine Datenweitergabe, keine Wartezeiten.

## Unterstützte Formate

| Kategorie | Formate | Konvertierungen |
|---|---|---|
| 🖼️ Bilder | JPG, PNG, WEBP, GIF, BMP, TIFF | untereinander + Bild → PDF |
| 📄 Dokumente | PDF, DOCX, TXT | untereinander (PDF→DOCX, DOCX→PDF, TXT→PDF, …) |
| 📊 Daten | CSV, XLSX, JSON | untereinander |
| 🎵 Audio | MP3, WAV, OGG, FLAC | untereinander |
| 🎬 Video | MP4, AVI, MOV, MKV | untereinander + Tonspur-Extraktion (→ MP3/WAV/OGG/FLAC) |

## Installation

**1. Python-Pakete installieren** (Python 3.10 oder neuer):

```bash
pip install -r requirements.txt
```

**2. ffmpeg installieren** (nur für Audio/Video nötig):

| System | Befehl |
|---|---|
| Windows | `winget install ffmpeg` |
| macOS | `brew install ffmpeg` |
| Linux (Debian/Ubuntu) | `sudo apt install ffmpeg` |

**3. LibreOffice installieren** (nur für DOCX → PDF nötig):

| System | Befehl / Quelle |
|---|---|
| Windows/macOS | [libreoffice.org](https://www.libreoffice.org/download/) – oder Microsoft Word ist bereits installiert, dann geht es auch damit |
| Linux (Debian/Ubuntu) | `sudo apt install libreoffice` |

## Starten

```bash
streamlit run app.py
```

Der Browser öffnet sich automatisch unter <http://localhost:8501>.

## Bedienung

1. Datei per Drag & Drop hochladen (oder über "Browse files").
2. Das Tool erkennt den Dateityp automatisch und zeigt nur sinnvolle Zielformate an.
3. Zielformat wählen, **Konvertieren** klicken.
4. Konvertierte Datei über den Download-Button speichern.

Die Sidebar zeigt beim Start einen **System-Check**: fehlende Pakete, ffmpeg
und LibreOffice werden erkannt und mit Installationshinweisen angezeigt.

## Projektstruktur

```
.
├── app.py                        # Streamlit-UI
├── requirements.txt              # Python-Abhängigkeiten
├── converters/
│   ├── __init__.py               # Format-Registry & Dispatch
│   ├── errors.py                 # ConversionError
│   ├── image_converter.py        # Bilder (Pillow)
│   ├── document_converter.py     # PDF/DOCX/TXT
│   ├── data_converter.py         # CSV/XLSX/JSON (Pandas)
│   ├── audio_converter.py        # Audio (ffmpeg)
│   ├── video_converter.py        # Video (ffmpeg)
│   └── ffmpeg_runner.py          # Gemeinsamer ffmpeg-Aufruf
└── utils/
    └── system_check.py           # Prüft ffmpeg, LibreOffice, Pakete
```

## 📱 Android-App (APK) & Web-Version

Neben der Desktop-Version gibt es den Konverter auch als **Android-App** und
als **eigenständige Website** – beide wandeln Dateien komplett lokal auf dem
Gerät um (nichts wird hochgeladen).

### APK installieren

Die fertige App liegt unter [`android/UniversalConverter.apk`](android/UniversalConverter.apk).

1. APK auf das Handy übertragen (oder direkt auf dem Handy herunterladen).
2. Die Datei antippen. Beim ersten Mal fragt Android nach der Erlaubnis,
   „Apps aus dieser Quelle" zu installieren – bestätigen.
3. App öffnen, Datei wählen, Zielformat wählen, konvertieren. Das Ergebnis
   wird über den „Speichern unter"-Dialog z.B. im Downloads-Ordner abgelegt.

Die App arbeitet **komplett offline** und unterstützt:

- **PDF** → PPTX (jede Seite als originalgetreues Folienbild), JPG, PNG
  (bei mehreren Seiten als ZIP), TXT
- **PPTX** → PDF, TXT (Texte + eingebettete Bilder, vereinfachtes Layout)
- **DOCX** → PDF, TXT
- **Bilder** (JPG/PNG/WEBP/GIF/BMP) → JPG/PNG/WEBP/PDF
- **Daten**: CSV ↔ XLSX ↔ JSON
- **TXT** → PDF, CSV

Nur Audio und Video übernimmt die Desktop-Version (dafür wird ffmpeg
benötigt, das auf Handys nicht verfügbar ist).

### Web-Version

Der Ordner [`web/`](web/) enthält dieselbe App als normale Website –
einfach `web/index.html` im Browser öffnen oder den Ordner auf einen
beliebigen Webspace (z.B. GitHub Pages) legen. Ohne Android-Umgebung nutzt
sie den normalen Browser-Download.

### APK selbst bauen

```bash
sudo apt install default-jdk-headless aapt zipalign apksigner \
                 dalvik-exchange android-sdk-platform-23
cd android && sh build_apk.sh
```

Das Skript kompiliert die App ohne Gradle/Android Studio und signiert sie mit
dem mitgelieferten Debug-Schlüssel (`android/debug.keystore`, Passwort
`android` – nur für den Eigengebrauch gedacht, nicht für den Play Store).

## Robustheit

- Jede Konvertierung ist in Fehlerbehandlung eingebettet – die App stürzt nie
  ab, sondern zeigt eine verständliche Fehlermeldung im UI (`st.error`).
- ffmpeg-Aufrufe haben ein Zeitlimit (10 Minuten), damit nichts hängen bleibt.
- Beschädigte oder falsch benannte Dateien werden sauber abgefangen.
- Transparente Bilder (PNG mit Alpha) werden für JPG/PDF automatisch auf
  weißen Hintergrund gelegt.
- CSV-Trennzeichen (Komma/Semikolon/Tab) werden automatisch erkannt.
