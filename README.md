# 📱 Meine Todos – Interaktive Todo-App

Eine hochinteraktive Todo-App für Android mit Schüttel-Gesten.

## ⬇️ APK herunterladen

**Download-Link:**
👉 **https://github.com/justusvoelkle3141592654-ux/Konvertieren-/releases/download/apk/MeineTodos.apk**

Nach dem Download die Datei öffnen und installieren (ggf. „Unbekannte Quellen zulassen" bestätigen).

## ✨ Funktionen

| Geste / Funktion | Wirkung |
|---|---|
| 📳 **Handy schütteln** | Letzte Aktion rückgängig machen (Undo) |
| 👉 **Nach rechts wischen** | Aufgabe als erledigt markieren |
| 👈 **Nach links wischen** | Aufgabe löschen |
| ✋ **Lange drücken** | Aufgabe bearbeiten |
| ☰ **Menü** | Verlauf, Statistiken, Einstellungen |
| 🕘 **Verlauf** | Alle Aktionen mit Zeitstempel |
| 📊 **Statistik** | Erledigt, offen, Prioritäten, heute erstellt |
| 🌙 **Dunkelmodus** | Umschaltbar im Menü |
| 🎉 **Konfetti** | Beim Erledigen einer Aufgabe |
| 🟢🟡🔴 **Prioritäten** | Niedrig / Mittel / Hoch |

Alle Daten werden lokal auf dem Gerät gespeichert.

## 🔨 Selbst bauen

Die APK wird automatisch von GitHub Actions gebaut (Workflow „APK bauen").
Lokal: `./gradlew assembleRelease` (benötigt Android SDK).
