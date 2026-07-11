#!/bin/sh
# Baut die Universal-Converter-APK ohne Gradle/Android Studio.
#
# Benötigte Debian/Ubuntu-Pakete:
#   sudo apt install default-jdk-headless aapt zipalign apksigner \
#                    dalvik-exchange android-sdk-platform-23
#
# Aufruf:  cd android && sh build_apk.sh
# Ergebnis: android/UniversalConverter.apk

set -e
cd "$(dirname "$0")"

SDK=/usr/lib/android-sdk
ANDROID_JAR="$SDK/platforms/android-23/android.jar"

if [ ! -f "$ANDROID_JAR" ]; then
    echo "FEHLER: $ANDROID_JAR fehlt (sudo apt install android-sdk-platform-23)" >&2
    exit 1
fi

echo "[1/6] Java kompilieren..."
rm -rf build
mkdir -p build/classes
javac -source 8 -target 8 -encoding UTF-8 \
    -bootclasspath "$ANDROID_JAR" \
    -d build/classes \
    src/app/konvertieren/converter/MainActivity.java

echo "[2/6] In DEX-Bytecode übersetzen..."
dalvik-exchange --dex --output=build/classes.dex build/classes

echo "[3/6] Ressourcen und Web-App (assets) paketieren..."
aapt package -f \
    -M AndroidManifest.xml \
    -S res \
    -A ../web \
    -I "$ANDROID_JAR" \
    -F build/app.unaligned.apk

echo "[4/6] classes.dex hinzufügen..."
(cd build && aapt add app.unaligned.apk classes.dex)

echo "[5/6] Ausrichten (zipalign)..."
zipalign -f 4 build/app.unaligned.apk build/app.aligned.apk

echo "[6/6] Signieren..."
if [ ! -f debug.keystore ]; then
    keytool -genkeypair -keystore debug.keystore -alias converter \
        -keyalg RSA -keysize 2048 -validity 10950 \
        -storepass android -keypass android \
        -dname "CN=Universal Converter, OU=Dev"
fi
apksigner sign \
    --ks debug.keystore --ks-key-alias converter \
    --ks-pass pass:android --key-pass pass:android \
    --out UniversalConverter.apk \
    build/app.aligned.apk

apksigner verify UniversalConverter.apk
echo ""
echo "Fertig: $(pwd)/UniversalConverter.apk"
