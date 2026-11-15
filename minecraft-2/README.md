# Minecraft 2

Ein Minecraft-inspiriertes Voxel-Sandbox, das vollständig im Browser läuft.
Die Spielmechanik und die Grafik orientieren sich am bekannten Spielgefühl, der Code
ist eine **eigenständige Implementierung**. Es ist ein inoffizielles Fanprojekt und
steht in keiner Verbindung zu Mojang oder Microsoft.

Technik: HTML5, CSS3, JavaScript (ES-Module), Three.js, Vite, Web Worker,
IndexedDB, Web Audio API, Pointer Lock API. Es ist kein Server, kein Konto und keine
Internetverbindung nötig (außer zum ersten Laden der Abhängigkeiten).

---

## Schnellstart

Voraussetzungen: Node.js 20.19 oder neuer (empfohlen 22), ein aktueller Chrome, Edge
oder Firefox mit WebGL 2 und Maus sowie Tastatur.

```bash
cd minecraft-2
npm install
npm run dev
```

Anschließend im Browser `http://127.0.0.1:5173` öffnen.

---

## Originaltexturen einbinden (optional, aber empfohlen)

Das Spiel funktioniert auch ohne Originaldateien: Dann werden eigene Platzhalter-Texturen
und synthetische Töne verwendet. Mit einer Minecraft-Installation, die du rechtmäßig besitzt,
lassen sich die Originaltexturen und Sounds lokal nutzen.

1. Die Client-JAR deiner Version finden:
   - Linux: `~/.minecraft/versions/VERSION/VERSION.jar`
   - Windows: `%APPDATA%\.minecraft\versions\VERSION\VERSION.jar`
   - macOS: `~/Library/Application Support/minecraft/versions/VERSION/VERSION.jar`
2. Das Script ausführen:

```bash
node scripts/setup-textures.js ~/.minecraft/versions/VERSION/VERSION.jar
```

```powershell
node scripts/setup-textures.js "$env:APPDATA\.minecraft\versions\VERSION\VERSION.jar"
```

Optionen: `--force` (vorhandene Dateien überschreiben), `--no-sounds` (keine Sounds),
`--no-music` (ohne Musik), `--out=PFAD` (anderer Zielordner).

Das Script liest die JAR nur. Es legt die Dateien mit ihrer ursprünglichen Verzeichnisstruktur
unter `local-assets/` ab (inklusive `.mcmeta`-Animationsdaten und `sounds.json`) und
meldet fehlende Dateien. Anschließend `npm run dev` neu starten.

### Rechtlicher Hinweis

- Die Texturen, Sounds und Musik gehören Mojang bzw. Microsoft. Sie bleiben lokal und
  werden **nicht** ins Repository aufgenommen. Der Ordner `local-assets/` steht in `.gitignore`.
- Veröffentliche oder verteile keine Originaldateien aus diesem Ordner.
- Beachte die Nutzungsbedingungen und Richtlinien von Minecraft.
- Das Spiel enthält kein Originallogo; der Titel wird aus eigenen Pixel-Glyphen gezeichnet.

---

## Steuerung (Standard, in den Optionen änderbar)

| Taste | Funktion |
| --- | --- |
| W A S D | Bewegen |
| Leertaste | Springen / im Flug aufsteigen |
| Umschalt | Schleichen / im Flug absteigen |
| Strg | Sprinten |
| E | Inventar |
| Q | Item fallen lassen |
| 1–9 / Mausrad | Hotbar |
| Linksklick | Abbauen / Angreifen |
| Rechtsklick | Platzieren / Benutzen |
| T | Chat |
| F5 | Perspektive wechseln |
| F3 | Debug-Overlay |
| F2 | Screenshot |
| ESC | Pausemenü |

Die Tastenbelegung ist unter **Optionen → Steuerung anpassen** änderbar.

---

## Befehle (Phase 4 und später)

`/gamemode survival|creative|0|1`, `/time set day|night`, `/tp`, `/give`, `/kill`, `/seed`.
F3 + N wechselt den Spielmodus.

---

## Projektstruktur

```
minecraft-2/
├── index.html, vite.config.js, package.json
├── scripts/setup-textures.js     Texture-Setup aus einer lokalen Client-JAR
├── public/favicon.png
├── local-assets/                 (lokal, nicht versioniert) extrahierte Originaldateien
├── src/
│   ├── main.js, game.js, session.js, config.js
│   ├── engine/                   Eingabe, Takt, Zufall
│   ├── world/                    Blöcke, Chunks, Mesher, Shader, Chunk-Verwaltung, Worker-Pool
│   ├── assets/                   Texturladen, Atlas, Platzhalter-Texturen
│   ├── systems/                  Einstellungen, Speichern (IndexedDB)
│   ├── ui/                       Menüs, Optionen, Pause, Laden, Tod, HUD
│   ├── player/                   Spielersteuerung
│   └── workers/chunk-worker.js   Weltgenerierung im Hintergrund
└── tests/
    ├── unit/                     Node-Tests (npm test)
    └── e2e/                      Browser-Tests (npm run test:e2e)
```

---

## Tests

```bash
npm test                          # Unit-Tests (Register, Zufall, Mesher)
CHROME_PATH=/pfad/zu/chrome npm run test:e2e   # Browser-Tests gegen den Dev-Server
```

`CHROME_PATH` zeigt auf eine installierte Chrome- oder Chromium-Binärdatei. Die Browser-Tests
starten den Dev-Server selbst (oder nutzen `E2E_BASE_URL`, falls gesetzt).

---

## Status der Entwicklung

| Phase | Inhalt | Stand |
| --- | --- | --- |
| 1 | Startmenü, Weltauswahl, Neue Welt, Optionen, Steuerung, Pause, Lade- und Todesbildschirm, Texture-Setup, Atlas | **abgeschlossen** (Abnahmetest `phase1-menus`) |
| 2 | Unendliche Oberwelt, Biome, Höhlen, Erze, Wasser/Lava, Licht, Tag/Nacht, Wetter, Speichern | in Arbeit |
| 3 | Spielerphysik, Hotbar, Inventar, Abbauen und Platzieren | ausstehend |
| 4 | Überleben (Leben, Hunger, Schaden), Kreativmodus, Befehle | ausstehend |
| 5 | Rezepte, Werkbank, Ofen, Truhen, Werkzeuge, Landwirtschaft, Fortschritte | ausstehend |
| 6 | Tiere und Monster mit KI, Kampf, Projektile | ausstehend |
| 7 | Nether, Ende, Portale, Festung, Enderdrache, Abspann | ausstehend |
| 8 | Sounds, Partikel, Debug-Overlay, Screenshots, Performance | ausstehend |

Dieser Stand wird mit jeder Phase aktualisiert. Nicht fertige Funktionen sind hier ausdrücklich
als offen gekennzeichnet.
