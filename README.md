# Nexus 🌐

**News · Sport · Videos · Quiz · Aufgaben — alles in einer App.**

Eine minimalistische, professionelle Web-App im Stil von Apples Liquid-Glass-Design:
schwarzer Hintergrund, Glas-Oberflächen, dezente Akzente. Kein Framework, kein
Build-Schritt — einfach öffnen.

## Starten

```bash
# Im Projektordner einen kleinen Server starten (empfohlen):
python3 -m http.server 8000
# dann im Browser öffnen:
# http://localhost:8000
```

Alternativ funktioniert auch GitHub Pages oder jeder statische Webserver.
Auf dem Smartphone lässt sich die App über „Zum Home-Bildschirm hinzufügen“
wie eine native App installieren (PWA-Manifest inklusive).

## Funktionen

### 🌤️ Wetter
- Wetterkarte oben im News-Tab: aktuelle Lage, gefühlte Temperatur, Wind,
  Luftfeuchte, 12-Stunden-Verlauf und 7-Tage-Vorhersage (Open-Meteo, ohne Schlüssel)
- Ort frei wählbar (Geocoding-Suche in den Einstellungen), abschaltbar

### 📰 News
- Ausschließlich geprüfte Redaktionen: **tagesschau, ZDFheute, ZEIT ONLINE, WELT**
- Eigener **„✦ Für dich“-Tab**, sobald persönliche Themen angelegt sind
- Große Karten mit Bildern, durchscrollbar, nach Aktualität sortiert
- **Artikel-Reader in der App:** Antippen öffnet den vollständigen Artikeltext in
  einer eigenen Leseansicht (tagesschau-API, JSON-LD bzw. Artikel-Extraktion) —
  mit Teilen-Funktion und Link zum Original
- Quellen-Filter per Chips, Quellen in den Einstellungen an-/abschaltbar
- **Personalisierung:** eigene Themen anlegen → passende Artikel erscheinen unter „Für dich“
- Aktualisiert sich bei jedem Öffnen der App automatisch

### ⚽ Sport (Live-Fußball)
- Live-Ergebnisse, Spieltag und komplette Tabelle für **Bundesliga,
  2. Bundesliga und 3. Liga** (OpenLigaDB, kostenlos, ohne Anmeldung)
- Laufende Spiele mit „Live“-Kennzeichnung, Tabellenzonen farblich markiert
  (Champions League / Europa League / Abstieg bzw. Auf-/Abstieg)
- Aktualisiert sich beim Öffnen automatisch

### ▶️ Videos
- YouTube-Suche mit **Live-Suchvorschlägen**, Tastatursteuerung inklusive
- Trends nach Region (DE/AT/CH/US) sowie Kategorie-Chips
- Videos starten **direkt in der App** (youtube-nocookie-Player) — ohne Account
- **Ersatz-Player** per Knopfdruck für Videos, deren Einbettung YouTube blockiert
- Mehrere API-Instanzen mit automatischem Fallback für zuverlässige Suche

### 🧠 Quiz
- Eigener Quiz-Tab: **Thema eingeben → die KI erstellt online ein Quiz** dazu
  (kostenlos über Pollinations.ai, ohne Konto)
- Multiple-Choice mit sofortiger Auflösung, Erklärung je Frage, Fortschrittsbalken
- Schwierigkeit (Einfach/Mittel/Schwer) und Fragenanzahl (5/8/10) wählbar
- Ergebnis mit Bewertung und Frage-für-Frage-Rückblick; letztes Ergebnis wird gemerkt

### 🔖 Merkliste
- Artikel und Videos mit einem Tipp merken (Lesezeichen-Symbol in Reader/Player)
- Gemerkte Artikel werden **mit Volltext gespeichert und sind offline lesbar**
- Verwaltung im Profil-Tab, im Datenexport enthalten

### ✅ Aufgaben
- To-do-Liste mit Fortschrittsring, Filtern und „Erledigte löschen“
- **Schütteln = Rückgängig:** Gerät schütteln macht die letzte Aktion rückgängig
  (auf iOS nach einmaligem Aktivieren, am Rechner per Strg/Cmd + Z)

### 👤 Profil & Einstellungen
- Registrierung und Anmeldung (rein lokal auf dem Gerät, Passwort als Hash gespeichert)
- Statistiken: gelesene Artikel, gesehene Videos, erledigte Aufgaben
- Großes Einstellungsmenü, alles funktional: Dunkel/Hell/System, Akzentfarbe,
  Bewegung reduzieren, Nachrichtenquellen, Themen, Bild-/Kompaktansicht,
  Video-Region, Autoplay, Aktualisierungsintervall, Schüttel-Empfindlichkeit,
  Datenexport (JSON) und App-Reset

## Android-App (APK)

Im Ordner `android/` liegt ein schlankes natives Android-Projekt (WebView-Container),
die fertig signierte App unter **`android/dist/nexus.apk`**.

Installation auf dem Handy:
1. `nexus.apk` aufs Gerät übertragen (z. B. per Download aus diesem Repo).
2. Antippen → Android fragt nach „Unbekannte Apps installieren“ → für den
   Browser/Dateimanager einmalig erlauben.
3. Installieren — fertig. Die App heißt „Nexus“ und hat das Welt-N-Logo.

Selbst bauen (ohne Android Studio, siehe Kopf von `android/build.sh`):

```bash
cd android && ./build.sh   # erzeugt dist/nexus.apk
```

Hinweis: Die APK ist mit einem lokalen Schlüssel selbstsigniert (`nexus.keystore`,
nur für den Privatgebrauch) — für eine Play-Store-Veröffentlichung wäre ein
eigener Release-Schlüssel nötig.

## Technik

- Vanilla HTML/CSS/JS (`index.html`, `styles.css`, `app.js`)
- Datenquellen: tagesschau-API, RSS-Feeds (ZDF/ZEIT/WELT), CoinGecko,
  Frankfurter (EZB), Yahoo Finance, Piped/Invidious für die YouTube-Suche
- CORS-Fallback über öffentliche Proxys, mehrstufige Instanz-Fallbacks
- Alle Nutzerdaten bleiben im `localStorage` des Geräts — kein Backend, kein Tracking
