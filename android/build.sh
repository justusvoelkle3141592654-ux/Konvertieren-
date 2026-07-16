#!/usr/bin/env bash
# ============================================================================
# Nexus — APK-Build ohne Android Studio.
#
# Benötigt (Ubuntu/Debian):
#   sudo apt-get install aapt zipalign apksigner dalvik-exchange openjdk-21-jdk
# sowie einmalig das Android-Framework-Jar (Compile-Klassenpfad + Ressourcen):
#   curl -L -o tools/android-all.jar https://repo.maven.apache.org/maven2/org/robolectric/android-all/14-robolectric-10818077/android-all-14-robolectric-10818077.jar
#
# Aufruf:  ./build.sh   → erzeugt dist/nexus.apk (signiert, installierbar)
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")"

ANDROID_JAR="${ANDROID_JAR:-tools/android-all.jar}"
KEYSTORE="${KEYSTORE:-nexus.keystore}"
KS_PASS="${KS_PASS:-nexus-local}"
OUT="dist"

[ -f "$ANDROID_JAR" ] || { echo "Fehlt: $ANDROID_JAR (siehe Kopfzeile dieses Skripts)"; exit 1; }

rm -rf build "$OUT"
mkdir -p build/classes build/assets "$OUT"

echo "[1/6] Web-App nach assets/ kopieren"
cp ../index.html ../styles.css ../app.js ../icon.svg ../manifest.webmanifest build/assets/
cp -r ../converter build/assets/converter

echo "[2/6] Java kompilieren"
javac --release 8 -Xlint:-options -cp "$ANDROID_JAR" -d build/classes \
  $(find src -name '*.java')

echo "[3/6] DEX erzeugen"
dalvik-exchange --dex --min-sdk-version=24 --output=build/classes.dex build/classes

echo "[4/6] Ressourcen & Manifest paketieren"
aapt package -f \
  -M AndroidManifest.xml \
  -S res \
  -A build/assets \
  -I "$ANDROID_JAR" \
  -F build/nexus.unaligned.apk
(cd build && aapt add nexus.unaligned.apk classes.dex >/dev/null)

echo "[5/6] Ausrichten (zipalign)"
zipalign -f 4 build/nexus.unaligned.apk build/nexus.aligned.apk

echo "[6/6] Signieren (v1+v2)"
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -alias nexus \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -dname "CN=Nexus, OU=Privat, O=Nexus, L=DE, C=DE"
fi
apksigner sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" \
  --ks-key-alias nexus --out "$OUT/nexus.apk" build/nexus.aligned.apk
apksigner verify --verbose "$OUT/nexus.apk" | head -5

echo
echo "Fertig: android/$OUT/nexus.apk"
