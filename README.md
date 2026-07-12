# 🎧 Hörbuch Konverter

Eine kostenlose Android-App, die **PDF- und Textdateien in Hörbücher** umwandelt –
komplett offline, ohne Werbung, ohne Kosten, ohne Längenbegrenzung.

## Was die App kann

- 📄 **PDF- oder Textdatei laden** (beliebig lang) – oder Text direkt einfügen
- 🗣️ **Vorlesen** mit den auf dem Gerät installierten Stimmen (z. B. Google-Sprachausgabe)
- 🎚️ **Stimme, Geschwindigkeit und Tonhöhe** frei einstellen
- 🎧 **Hörbuch erstellen**: Der komplette Text wird im Hintergrund in eine
  **M4A-Audiodatei** umgewandelt und unter `Musik/Hoerbuecher` gespeichert –
  abspielbar mit jedem Musik-Player
- ♾️ **Unbegrenzte Länge**: Der Text wird abschnittsweise verarbeitet und
  platzsparend als AAC kodiert, auch ganze Bücher sind kein Problem

## APK herunterladen

Die fertige APK wird bei jedem Push automatisch von GitHub Actions gebaut:

1. Auf der GitHub-Seite des Projekts unter **Releases** das Release **„Hörbuch Konverter – neueste APK“** öffnen
2. `Hoerbuch-Konverter.apk` auf dem Handy herunterladen
3. Beim Installieren einmalig **„Installation aus unbekannten Quellen“** erlauben

Alternativ liegt die APK auch bei jedem Workflow-Lauf unter **Actions → Artefakte**.

## Tipp für die beste Stimmqualität

Die App nutzt die auf dem Gerät installierte Sprachausgabe (Text-to-Speech).
Für besonders natürliche Stimmen:

1. **„Sprachdienste von Google“** über den Play Store installieren bzw. aktualisieren
2. In den Android-Einstellungen unter *System → Sprachausgabe* die Google-Engine wählen
3. Dort können auch **hochwertige Offline-Stimmen für Deutsch** heruntergeladen werden
4. In der App anschließend im Stimmen-Menü die gewünschte Stimme auswählen

## Hinweise

- **Gescannte PDFs** (reine Bilder ohne Textebene) enthalten keinen extrahierbaren
  Text und können nicht umgewandelt werden
- Die Konvertierung langer Bücher dauert einige Minuten und läuft als
  Hintergrund-Dienst mit Fortschrittsanzeige in der Benachrichtigungsleiste
- Mindestvoraussetzung: **Android 10** (API 29)

## Selbst bauen

```bash
./gradlew assembleRelease
# Ergebnis: app/build/outputs/apk/release/app-release.apk
```

Der Signatur-Keystore (`keystore/hoerbuch.jks`) liegt bewusst im Repository,
damit die CI installierbare, aktualisierbare APKs bauen kann. Er dient nur der
Eigenverteilung dieser Gratis-App – für eine Play-Store-Veröffentlichung müsste
ein eigener, geheimer Schlüssel verwendet werden.

## Technik

- Kotlin, Material 3, Single-Activity-UI
- PDF-Textextraktion: [PdfBox-Android](https://github.com/TomRoush/PdfBox-Android)
- Sprachsynthese: Android `TextToSpeech`-API (abschnittsweise `synthesizeToFile`)
- Audio: WAV-Zwischenformat → `MediaCodec`-AAC-Encoder → M4A via `MediaMuxer`
- Speicherung über `MediaStore` (keine Speicher-Berechtigung nötig)
