#!/bin/sh
# Compila el APK "release" (no depurable y firmado): es el que se instala en el
# celular del cajero. SumUp Tap to Pay solo cobra con un APK no depurable; el
# de debug (build-debug.sh) sirve para probar todo lo demás, no la tarjeta.
#
# Requiere en ~/.gradle/gradle.properties (fuera del repo):
#   SUMUP_TTP_MAVEN_USER / SUMUP_TTP_MAVEN_PASSWORD   (SDK de SumUp)
#   MONAY_POS_KEYSTORE_FILE / MONAY_POS_KEYSTORE_PASSWORD /
#   MONAY_POS_KEY_ALIAS / MONAY_POS_KEY_PASSWORD      (firma de la app)
#
# Uso: sh build-release.sh
set -e
cd "$(dirname "$0")"

JAVA21="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
if [ ! -x "$JAVA21/bin/java" ]; then
  echo "No se encontró Java 21 en $JAVA21. Instálalo con: brew install openjdk@21" >&2
  exit 1
fi
if ! grep -q '^MONAY_POS_KEYSTORE_FILE=' "$HOME/.gradle/gradle.properties" 2>/dev/null; then
  echo "Falta la llave de firma (MONAY_POS_KEYSTORE_*) en ~/.gradle/gradle.properties. Ver android/README.md." >&2
  exit 1
fi

JAVA_HOME="$JAVA21" ./gradlew assembleRelease
echo ""
echo "APK generado en: $(pwd)/app/build/outputs/apk/release/app-release.apk"
