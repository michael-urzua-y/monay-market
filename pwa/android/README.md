# Monay Market POS — app Android (Capacitor)

App nativa de la **caja (cajero)**. Carga en vivo `https://pos.serviciohyh.cl/pos/`
dentro de un WebView (ver `server.url` en [`../capacitor.config.json`](../capacitor.config.json));
no empaqueta los archivos del POS, así que **actualizar la UI/JS del POS no
requiere recompilar el APK**. Solo hay que recompilar cuando cambia algo nativo
(permisos, ícono, y — cuando llegue el acceso de SumUp — el SDK de Tap to Pay).

El **dashboard** (dueño/admin) sigue siendo un sitio web normal, sin cambios;
esta app solo empaqueta el POS del cajero.

## Por qué existe

El cobro con tarjeta vía SumUp (ver [`../src/sumup.js`](../src/sumup.js)) usa
hoy el esquema `sumupmerchant://` (Payment Switch), que SumUp documenta como
legado y sin garantía de volver a un navegador web. El camino soportado es su
**Tap-to-Pay SDK nativo para Android**, que exige una app Android de verdad.
Mientras se gestiona el acceso al SDK con SumUp (solicitado a
`integration@sumup.com`), esta app ya sirve para **pagos en efectivo**, igual
que la PWA en Chrome.

## Requisitos para compilar

- **Java 21** (el módulo `capacitor-android` lo exige; Java 17 no alcanza,
  aunque cumple el mínimo que pide el SDK de SumUp). Instalar con:
  ```
  brew install openjdk@21
  ```
- Android SDK con `platforms;android-36` y `build-tools;36.0.0` (o superior).
  `local.properties` (no versionado) apunta a tu `sdk.dir` local.

## Compilar

```bash
sh build-debug.sh
```

Genera `app/build/outputs/apk/debug/app-debug.apk`. Ese script fija
`JAVA_HOME` a Java 21 por la ruta de Homebrew, para no depender de que el
shell ya lo tenga bien apuntado.

## Instalar en un celular (sin Play Store)

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

O copia el `.apk` al celular y ábrelo desde ahí (hay que permitir "instalar
apps de orígenes desconocidos" la primera vez).

## Configuración

- `appId` / paquete: **`cl.monaymarket.pos`** — debe coincidir exactamente
  con el `app-id` configurado en la Affiliate Key de SumUp. Si se cambia
  acá, hay que cambiarlo también en SumUp.
- Servidor remoto: `capacitor.config.json` → `server.url`. Apunta hoy al
  VPS de prueba `pos.serviciohyh.cl`. Cuando exista un dominio/servidor de
  producción propio, cambiar esa URL y recompilar (`sh build-debug.sh`).
- `minSdkVersion = 30` (Android 11), por el mínimo que exige el SDK de
  SumUp Tap to Pay — ver [`variables.gradle`](variables.gradle).

## Pendiente (cuando llegue el acceso de SumUp)

1. Agregar las credenciales Maven de SumUp a `build.gradle` / `settings.gradle`.
2. Escribir un plugin nativo de Capacitor (Kotlin) que exponga `startPayment`
   del Tap-to-Pay SDK a `sumup.js`, reemplazando el esquema `sumupmerchant://`.
3. Revisar `android:required` de `android.hardware.nfc` en el manifest según
   cómo se termine distribuyendo la app.
4. Confirmar requisitos de Chile con SumUp: PIN obligatorio y `processCardAs`.
