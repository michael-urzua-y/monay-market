#!/bin/sh
# Compila el APK de debug sin depender de que JAVA_HOME ya esté bien
# apuntado en el shell. El módulo capacitor-android exige compilar con
# Java 21+ (Java 17 solo, aunque cumple el mínimo del SDK de SumUp, no
# alcanza para este módulo de Capacitor).
#
# Uso: sh build-debug.sh
set -e
cd "$(dirname "$0")"

JAVA21="/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home"
if [ ! -x "$JAVA21/bin/java" ]; then
  echo "No se encontró Java 21 en $JAVA21. Instálalo con: brew install openjdk@21" >&2
  exit 1
fi

JAVA_HOME="$JAVA21" ./gradlew assembleDebug
echo ""
echo "APK generado en: $(pwd)/app/build/outputs/apk/debug/app-debug.apk"
