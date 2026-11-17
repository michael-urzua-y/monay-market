# Monay Market POS — app Android (Capacitor)

App nativa de la **caja (cajero)**. Carga en vivo `https://pos.serviciohyh.cl/pos/`
dentro de un WebView (ver `server.url` en [`../capacitor.config.json`](../capacitor.config.json));
no empaqueta los archivos del POS, así que **actualizar la UI/JS del POS no
requiere recompilar el APK**. Solo hay que recompilar cuando cambia algo nativo
(permisos, ícono, plugins nativos o el SDK de SumUp Tap to Pay).

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

## Cobro con tarjeta (SumUp Tap to Pay)

El cliente acerca su tarjeta al celular del cajero e ingresa su PIN en la
pantalla de SumUp. Piezas:

- **SDK** `com.sumup.tap-to-pay:utopia-sdk` (versión en
  [`variables.gradle`](variables.gradle)), desde el Maven privado de SumUp.
- **Plugin nativo** [`SumUpTapToPayPlugin.kt`](app/src/main/java/cl/monaymarket/pos/SumUpTapToPayPlugin.kt)
  (`init`, `startPayment`, `tearDown`), registrado en `MainActivity`.
- **Caja**: [`src/card-payment.js`](../src/card-payment.js) y `chargeCard()` en
  `src/app.js`. La venta se registra **solo** si SumUp aprueba, con
  `card_transaction_ref` = código de SumUp (así el servidor emite la boleta).
  Si el resultado es incierto no se registra y se pide revisar en SumUp.
- **Claves por negocio**: el dueño las ingresa en el panel (Configuración →
  Cobro con tarjeta). Se guardan cifradas y la app las pide al entrar el
  cajero (`GET /tenant/card-payment`); quedan solo en memoria.

Requisitos de SumUp para cobrar:

- APK **release** (no depurable): `sh build-release.sh`. El de debug no cobra.
- En el celular: **Opciones de desarrollador y Depuración USB desactivadas**
  (si no, SumUp bloquea el cobro y no muestra el PIN). NFC encendido.
- Chile: `processCardAs` en cada cobro (la caja pregunta Débito / Crédito) y
  PIN siempre. Monto en CLP × 100 (lo hace el plugin).
- Avisar a SumUp (`integration@sumup.com`) antes de pasar a producción.

## Requisitos para compilar

- **Credenciales del Maven de SumUp** en `~/.gradle/gradle.properties`
  (nunca en el repo):
  ```
  SUMUP_TTP_MAVEN_USER=...
  SUMUP_TTP_MAVEN_PASSWORD=...
  ```
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
sh build-release.sh   # el que se instala en la caja (cobra con tarjeta)
sh build-debug.sh     # pruebas sin tarjeta
```

**Firma del release**: la llave está en `~/.monay-market/monay-pos-release.jks`
y sus claves en `~/.gradle/gradle.properties` (`MONAY_POS_KEYSTORE_FILE`,
`MONAY_POS_KEYSTORE_PASSWORD`, `MONAY_POS_KEY_ALIAS`, `MONAY_POS_KEY_PASSWORD`).
**Respaldar ambos**: sin la misma llave no se puede actualizar la app ya
instalada (habría que desinstalar, y se pierde lo guardado en el celular).

Genera `app/build/outputs/apk/debug/app-debug.apk`. Ese script fija
`JAVA_HOME` a Java 21 por la ruta de Homebrew, para no depender de que el
shell ya lo tenga bien apuntado.

## Instalar en un celular (sin Play Store)

```bash
adb install -r app/build/outputs/apk/release/app-release.apk
```

O copia el `.apk` al celular y ábrelo desde ahí (hay que permitir "instalar
apps de orígenes desconocidos" la primera vez).

## Configuración

- `appId` / paquete: **`cl.monaymarket.pos`** — debe coincidir exactamente
  con el `app-id` configurado en la Affiliate Key de SumUp. Si se cambia
  acá, hay que cambiarlo también en SumUp.
- Servidor remoto: `capacitor.config.json` → `server.url`. Apunta hoy al
  VPS de prueba `pos.serviciohyh.cl`. Cuando exista un dominio/servidor de
  producción propio, cambiar esa URL y recompilar (`sh build-release.sh`).
- `minSdkVersion = 30` (Android 11), por el mínimo que exige el SDK de
  SumUp Tap to Pay — ver [`variables.gradle`](variables.gradle).
