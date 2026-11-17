// ============================================================
// Monay Market POS — Impresora térmica por Bluetooth directo
//
// La app se conecta sola a la impresora y le envía la boleta en ESC/POS
// (ver receipt-escpos.js), sin diálogo de impresión ni apps intermedias.
//
// Usa el plugin @capacitor-community/bluetooth-le sobre BLE nativo de Android
// (dentro del WebView de la app no existe navigator.bluetooth). El plugin se
// carga bajo demanda desde src/vendor/.
//
// Requisito: una impresora con Bluetooth LE (4.0+). Las que solo tienen
// Bluetooth "clásico" no aparecen al vincular.
// ============================================================

import { buildReceipt, buildTestTicket } from './receipt-escpos.js?v=57'; // misma versión que en app.js
import { loadCapacitorCore, loadVendorScript } from './platform.js?v=57';

// Servicios BLE "serial" de las térmicas chinas más comunes (Xprinter, Goojprt, Zjiang, MTP…)
var SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

var STORAGE_DEVICE = 'monay_pos_printer_device_id';
var STORAGE_PAPER = 'monay_pos_printer_paper';

// Tamaño de cada envío. Se parte en 180 bytes y, si la impresora no los acepta
// (MTU chico), se baja a 20 —el mínimo que todo dispositivo BLE admite— y se recuerda.
var CHUNK_LARGE = 180;
var CHUNK_SAFE = 20;
// Pausa entre envíos sin confirmación: las impresoras baratas pierden bytes si se les satura.
var PACE_MS = 12;
var CONNECT_TIMEOUT_MS = 8000;
var WRITE_TIMEOUT_MS = 5000;

var state = {
  deviceId: null,
  deviceName: '',
  // Servicio y característica escribibles de la impresora conectada
  writable: null,
  connected: false,
  chunkSize: CHUNK_LARGE,
};

/** Error de impresión. `started` indica si alcanzó a enviarse algo (posible ticket a medias). */
function PrinterError(message, started) {
  var err = new Error(message);
  err.name = 'PrinterError';
  err.started = !!started;
  return err;
}

function storage(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (e) {
    // Almacenamiento bloqueado: se mantiene solo en memoria durante la sesión
  }
  return null;
}

/** Avisa a la app que cambió el estado de la impresora (para el indicador del encabezado). */
function notifyChange() {
  try {
    window.dispatchEvent(new Event('monay-printer-change'));
  } catch (e) {
    // Sin soporte de eventos: el indicador se actualiza al abrir el panel
  }
}

function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

function withTimeout(promise, ms, message) {
  var timer;
  return Promise.race([
    promise,
    new Promise(function (_, reject) {
      timer = setTimeout(function () { reject(new Error(message)); }, ms);
    }),
  ]).finally(function () { clearTimeout(timer); });
}

// ----------------------------------------------------------
// Plugin Bluetooth (carga bajo demanda)
// ----------------------------------------------------------
var bleLoadPromise = null;
var bleInitPromise = null;

/** Carga un archivo de src/vendor/ con la misma versión (?v=) con que se cargó este módulo. */
/** El plugin Bluetooth (vendor/capacitor-bluetooth-le.js) necesita antes @capacitor/core. */
function loadBleClient() {
  var loaded = function () {
    var plugin = window.capacitorCommunityBluetoothLe;
    return plugin && plugin.BleClient;
  };
  if (loaded()) return Promise.resolve(loaded());
  if (bleLoadPromise) return bleLoadPromise;
  bleLoadPromise = loadCapacitorCore()
    .then(function () { return loadVendorScript('capacitor-bluetooth-le.js'); })
    .then(function () {
      if (!loaded()) throw new Error('plugin sin registrar');
      return loaded();
    })
    .catch(function () {
      bleLoadPromise = null;
      throw PrinterError('No se pudo cargar el Bluetooth de la app. Cierre la app y vuelva a abrirla.');
    });
  return bleLoadPromise;
}

/** BleClient listo para usar (cargado e inicializado; la primera vez Android pide el permiso). */
function ble() {
  return loadBleClient().then(function (BleClient) {
    if (!bleInitPromise) {
      // neverForLocation: en Android 12+ solo pide "Dispositivos cercanos", no la
      // ubicación (va junto con el permiso BLUETOOTH_SCAN del AndroidManifest).
      bleInitPromise = BleClient.initialize({ androidNeverForLocation: true }).catch(function (err) {
        bleInitPromise = null;
        throw err;
      });
    }
    return bleInitPromise.then(function () { return BleClient; });
  });
}

// ----------------------------------------------------------
// Estado y preferencias
// ----------------------------------------------------------

/** Hay una impresora vinculada en este dispositivo. */
function isPaired() {
  return !!(state.deviceId || storage(STORAGE_DEVICE));
}

function isConnected() {
  return state.connected;
}

function getPaper() {
  return storage(STORAGE_PAPER) === '80' ? 80 : 58;
}

function setPaper(mm) {
  storage(STORAGE_PAPER, mm === 80 ? '80' : '58');
}

/**
 * La impresora está vinculada pero hay que volver a elegirla en la lista: el
 * plugin no puede recuperar el dispositivo tras reabrir la app sin que el
 * cajero lo elija otra vez.
 */
function needsReselect() {
  return isPaired() && !state.deviceId;
}

function deviceName() {
  return state.deviceName || '';
}

function markConnected(writable) {
  state.writable = writable;
  state.connected = true;
  notifyChange();
  return writable;
}

function markDisconnected() {
  state.connected = false;
  state.writable = null;
  notifyChange();
}

function forget() {
  disconnect();
  state.deviceId = null;
  state.deviceName = '';
  storage(STORAGE_DEVICE, null);
  notifyChange();
}

// ----------------------------------------------------------
// Conexión
// ----------------------------------------------------------

/** Vincula una impresora (abre la lista de dispositivos; requiere un toque del cajero). */
function pair() {
  return ble().then(function (BleClient) {
    return readyToScan(BleClient).then(function () {
      return BleClient.requestDevice({ optionalServices: SERVICES });
    }).then(function (device) {
      disconnect();
      state.deviceId = device.deviceId;
      state.deviceName = device.name || '';
      storage(STORAGE_DEVICE, device.deviceId);
      return connect(BleClient, device.deviceId);
    });
  }).catch(function (err) {
    throw pairError(err);
  });
}

/**
 * Antes de buscar: si el Bluetooth está apagado, Android muestra "¿Activar
 * Bluetooth?" y solo se busca si el cajero acepta. Así la lista no sale vacía.
 */
function ensureBluetoothOn(BleClient) {
  return BleClient.isEnabled().then(function (enabled) {
    if (enabled) return;
    return BleClient.requestEnable()
      .catch(function () {}) // rechazado: se vuelve a consultar abajo
      .then(function () { return BleClient.isEnabled(); })
      .then(function (on) {
        if (!on) throw PrinterError('Active el Bluetooth del celular para buscar la impresora.');
      });
  });
}

/**
 * En Android 11 (el mínimo de la app) Android solo encuentra dispositivos
 * Bluetooth con la ubicación del celular encendida; desde Android 12 no hace falta.
 */
function ensureLocationForScan(BleClient) {
  if (!/Android 11\b/.test(navigator.userAgent)) return Promise.resolve();
  return BleClient.isLocationEnabled().then(function (on) {
    if (on) return;
    BleClient.openLocationSettings().catch(function () {});
    throw PrinterError('En este celular Android exige la ubicación encendida para buscar la impresora. Actívela y vuelva a intentar.');
  });
}

function readyToScan(BleClient) {
  return ensureBluetoothOn(BleClient).then(function () { return ensureLocationForScan(BleClient); });
}

/** Traduce los errores del plugin Bluetooth (en inglés) a instrucciones para el cajero. */
function pairError(err) {
  var message = (err && err.message) || '';
  if (/requestDevice cancelled/i.test(message)) {
    // Cerró la lista sin elegir: no es un error, la app no muestra aviso
    var cancelled = new Error('Selección cancelada');
    cancelled.name = 'NotFoundError';
    return cancelled;
  }
  if (/permission/i.test(message)) {
    return PrinterError('Falta el permiso "Dispositivos cercanos". Actívelo en Ajustes > Apps > Monay Market POS > Permisos y vuelva a intentar.');
  }
  if (/not available|not enabled/i.test(message)) {
    return PrinterError('Active el Bluetooth del celular y vuelva a intentar.');
  }
  if (/no device found/i.test(message)) {
    return PrinterError('No se encontró ninguna impresora cerca. ¿Está encendida?');
  }
  return err && err.name === 'PrinterError' ? err : PrinterError(message || 'No se pudo vincular la impresora');
}

/** Conecta y busca dónde escribir: primero los servicios "serial" conocidos de impresoras. */
function connect(BleClient, deviceId) {
  return withTimeout(BleClient.connect(deviceId, markDisconnected), CONNECT_TIMEOUT_MS, 'La impresora no responde. ¿Está encendida y cerca?')
    .then(function () { return BleClient.getServices(deviceId); })
    .then(function (services) {
      var known = function (s) { return SERVICES.indexOf(s.uuid.toLowerCase()) >= 0; };
      var ordered = services.filter(known).concat(services.filter(function (s) { return !known(s); }));
      for (var i = 0; i < ordered.length; i++) {
        var characteristic = (ordered[i].characteristics || []).filter(function (c) {
          return c.properties && (c.properties.writeWithoutResponse || c.properties.write);
        })[0];
        if (characteristic) {
          return {
            serviceUuid: ordered[i].uuid,
            characteristicUuid: characteristic.uuid,
            writeWithoutResponse: !!characteristic.properties.writeWithoutResponse,
          };
        }
      }
      throw PrinterError('Este dispositivo no parece una impresora compatible');
    })
    .then(markConnected);
}

/** Deja la conexión lista. Se puede llamar antes de cobrar para que imprimir sea inmediato. */
function ensureConnected() {
  if (isConnected()) return Promise.resolve(state.writable);
  if (!isPaired()) return Promise.reject(PrinterError('No hay impresora vinculada'));
  if (!state.deviceId) {
    // Tras reabrir la app no queda registro del dispositivo: hay que elegirlo de nuevo.
    return Promise.reject(PrinterError('Toque "Conectar impresora" y elíjala en la lista'));
  }
  return ble().then(function (BleClient) {
    return ensureBluetoothOn(BleClient).then(function () {
      return connect(BleClient, state.deviceId);
    });
  });
}

function disconnect() {
  if (state.deviceId && state.connected) {
    var deviceId = state.deviceId;
    ble().then(function (BleClient) {
      BleClient.disconnect(deviceId).catch(function () {});
    });
  }
  state.connected = false;
  state.writable = null;
}

// ----------------------------------------------------------
// Envío
// ----------------------------------------------------------

/**
 * Envía los bytes en fragmentos. Si el primero se rechaza (MTU chico) baja al
 * tamaño mínimo garantizado y lo recuerda; si se corta a mitad, lo marca como
 * `started` para que la app no reintente sola (evita tickets dobles).
 */
function sendBytes(bytes) {
  return ensureConnected()
    .catch(function (err) {
      throw err.name === 'PrinterError' ? err : PrinterError(err.message || 'No se pudo conectar con la impresora');
    })
    .then(ble)
    .then(function (BleClient) {
      var writable = state.writable;
      var write = function (chunk) {
        var array = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
        var value = new DataView(array.buffer, array.byteOffset, array.byteLength);
        if (writable.writeWithoutResponse) {
          return BleClient
            .writeWithoutResponse(state.deviceId, writable.serviceUuid, writable.characteristicUuid, value, { timeout: WRITE_TIMEOUT_MS })
            .then(function () { return delay(PACE_MS); });
        }
        return BleClient.write(state.deviceId, writable.serviceUuid, writable.characteristicUuid, value, { timeout: WRITE_TIMEOUT_MS });
      };
      var offset = 0;
      var next = function () {
        if (offset >= bytes.length) return Promise.resolve();
        var chunk = bytes.slice(offset, offset + state.chunkSize);
        return write(chunk).then(
          function () {
            offset += chunk.length;
            return next();
          },
          function (err) {
            if (offset === 0 && state.chunkSize > CHUNK_SAFE) {
              state.chunkSize = CHUNK_SAFE;
              return next();
            }
            throw PrinterError('Se cortó la conexión con la impresora', offset > 0 || !!(err && err.started));
          },
        );
      };
      return next();
    });
}

/**
 * Imprime la boleta.
 * @param receipt  datos formateados (mapReceiptForThermalPrinter en app.js)
 * @param timbre   mapa de bits del PDF417 (toMonochrome) o null
 */
function printReceipt(receipt, timbre) {
  return sendBytes(buildReceipt(receipt, { paper: getPaper(), timbre: timbre }));
}

function printTest() {
  return sendBytes(buildTestTicket({ paper: getPaper() }));
}

/** Ancho imprimible en puntos para el papel configurado. */
function paperDots() {
  return getPaper() === 80 ? 576 : 384;
}

export var ThermalPrinter = {
  isPaired: isPaired,
  isConnected: isConnected,
  needsReselect: needsReselect,
  deviceName: deviceName,
  getPaper: getPaper,
  setPaper: setPaper,
  paperDots: paperDots,
  pair: pair,
  connect: ensureConnected,
  forget: forget,
  printReceipt: printReceipt,
  printTest: printTest,
};
