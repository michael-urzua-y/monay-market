# Monay Market POS — app Android (Capacitor)

App nativa de la **caja (cajero)**. Carga en vivo `https://pos.serviciohyh.cl/pos/`
dentro de un WebView (ver `server.url` en [`../capacitor.config.json`](../capacitor.config.json));
no empaqueta los archivos del POS, así que **actualizar la UI/JS del POS no
requiere recompilar el APK**. Solo hay que recompilar cuando cambia algo nativo
(permisos, ícono, y — cuando llegue el acceso de SumUp — el SDK de Tap to Pay).

El **dashboard** (dueño/admin) sigue siendo un sitio web normal, sin cambios;
esta app solo empaqueta el POS del cajero. Sin sesión, la app muestra su propio
login de caja (no el login ni la portada del sitio) y **solo admite cajeros**:
si entra un dueño o admin, el token se descarta y se le pide usar el panel web.
La caja se usa solo desde esta app: abierta en un navegador muestra un aviso.
Cerrar sesión vuelve a ese login sin recargar, así la impresora queda conectada
para el siguiente cajero.

## Íconos

Generados con `@capacitor/assets` desde [`icon-source.png`](icon-source.png)
(colibrí sobre fondo oscuro, 512×512). Para regenerarlos, copiarlo a
`pos/assets/icon.png` y `pos/assets/icon-foreground.png` y ejecutar
`npx @capacitor/assets generate --android` desde `pos/`.

## Cobro con tarjeta (pendiente)

El cobro con SumUp por el esquema `sumupmerchant://` (Payment Switch) se probó
y se descartó: SumUp lo documenta como legado y sin garantía de volver a la app
que lo abre (en las pruebas hubo cobros que no volvieron). El camino soportado
es su **Tap-to-Pay SDK nativo para Android**, que se integra en esta app.
Mientras se gestiona el acceso al SDK (solicitado a `integration@sumup.com`),
la caja vende en **efectivo** y el botón "Tarjeta" está deshabilitado.

## Requisitos para compilar

- **Java 21** (el módulo `capacitor-android` lo exige; Java 17 no alcanza,
  aunque cumple el mínimo que pide el SDK de SumUp). Instalar con:
  ```
  brew install openjdk@21
  ```
- Android SDK con `platforms;android-36` y `build-tools;36.0.0` (o superior).
  `local.properties` (no versionado) apunta a tu `sdk.dir` local.

## Archivos de Capacitor que usa la caja

La caja carga sus módulos sin empaquetador, y el WebView solo inyecta el
puente nativo. Por eso la impresora Bluetooth necesita dos archivos copiados
desde `node_modules` en `src/vendor/`: `capacitor-core.js` (`@capacitor/core`)
y `capacitor-bluetooth-le.js` (el plugin). **Deben ser de la misma versión que
la parte nativa del APK.** Al actualizar paquetes de Capacitor, ejecutar
`npm run cap:sync` (incluye `npm run vendor:sync`) y recompilar.

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
   del Tap-to-Pay SDK a la caja, y conectarlo donde `processSale` deja el comentario
   de tarjeta. Habilitar el botón "Tarjeta" en `index.html` (hoy `disabled`).
3. Revisar `android:required` de `android.hardware.nfc` en el manifest según
   cómo se termine distribuyendo la app.
4. Confirmar requisitos de Chile con SumUp: PIN obligatorio y `processCardAs`.
