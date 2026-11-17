// ============================================================
// Monay Market POS — Impresora térmica por Bluetooth directo
//
// Reemplaza a RawBT: la app se conecta sola a la impresora y le envía la
// boleta en ESC/POS (ver receipt-escpos.js), sin diálogo de impresión.
//
// Dos transportes, misma interfaz pública (ThermalPrinter.*), según dónde
// corre la página:
//   - Chrome en Android (PWA): Web Bluetooth (navigator.bluetooth).
//   - App nativa (Capacitor): navigator.bluetooth NO existe dentro del
//     WebView de Android, así que se usa el plugin
//     @capacitor-community/bluetooth-le (src/vendor/capacitor-bluetooth-le.js,
//     cargado bajo demanda) sobre BLE nativo.
//
// Requisito en ambos casos: una impresora con Bluetooth LE (4.0+). Las que
// solo tienen Bluetooth "clásico" no aparecen al vincular: para esas la app
// sigue usando window.print() + RawBT (fuera de este módulo).
// ============================================================

import { buildReceipt, buildTestTicket } from './receipt-escpos.js?v=44'; // misma versión que en app.js
import { isNativeApp } from './platform.js?v=44';

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
var CONNECT_TIMEOUT_MESSAGE = 'La impresora no responde. ¿Está encendida y cerca?';
var WRITE_TIMEOUT_MS = 5000;

var state = {
  // Transporte activo: se decide una vez, al primer uso (ver getTransport()).
  transport: null,
  deviceId: null,
  deviceName: '',
  // Solo lo usa el transporte Web Bluetooth (objeto BluetoothDevice real).
  webDevice: null,
  // Característica escribible encontrada (forma depende del transporte).
  writable: null,
  connected: false,
  connecting: null,
  chunkSize: CHUNK_LARGE,
  // Hay una impresora guardada pero no se puede recuperar sin elegirla de nuevo
  lost: false,
};

/** Error de impresión. `started` indica si alcanzó a enviarse algo (posible ticket a medias). */
export function PrinterError(message, started) {
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

/** Primero los servicios "serial" conocidos de impresoras térmicas, después el resto. */
function orderServices(services, uuidOf) {
  var known = function (s) { return SERVICES.indexOf(uuidOf(s).toLowerCase()) >= 0; };
  return services.filter(known).concat(services.filter(function (s) { return !known(s); }));
}

/**
 * Envía los bytes en fragmentos con `writeChunk(chunk) → Promise`. Común a
 * ambos transportes: si el primer fragmento se rechaza (MTU chico), baja al
 * tamaño mínimo garantizado y lo recuerda; si se corta a mitad, lo marca
 * como `started` para que la app no reintente sola (evita tickets dobles).
 */
function sendChunked(bytes, writeChunk) {
  var offset = 0;
  function next() {
    if (offset >= bytes.length) return Promise.resolve();
    var chunk = bytes.slice(offset, offset + state.chunkSize);
    return writeChunk(chunk).then(
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
  }
  return next();
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

// ----------------------------------------------------------
// Qué transporte usar: Web Bluetooth (Chrome) o el plugin nativo (Capacitor)
// ----------------------------------------------------------
function hasWebBluetooth() {
  return !!(navigator.bluetooth && typeof navigator.bluetooth.requestDevice === 'function');
}

/** 'web' (Web Bluetooth), 'native' (plugin BLE de Capacitor) o null si ninguno aplica. */
function getTransportKind() {
  if (isNativeApp()) return 'native';
  if (hasWebBluetooth()) return 'web';
  return null;
}

function isSupported() {
  return getTransportKind() !== null;
}

var bleLoadPromise = null;

/** Carga src/vendor/capacitor-bluetooth-le.js bajo demanda (solo dentro de la app nativa). */
function loadBleClient() {
  if (window.capacitorCommunityBluetoothLe && window.capacitorCommunityBluetoothLe.BleClient) {
    return Promise.resolve(window.capacitorCommunityBluetoothLe.BleClient);
  }
  if (bleLoadPromise) return bleLoadPromise;
  bleLoadPromise = new Promise(function (resolve, reject) {
    var script = document.createElement('script');
    script.src = 'src/vendor/capacitor-bluetooth-le.js';
    script.async = true;
    script.addEventListener('load', function () {
      if (window.capacitorCommunityBluetoothLe && window.capacitorCommunityBluetoothLe.BleClient) {
        resolve(window.capacitorCommunityBluetoothLe.BleClient);
      } else {
        bleLoadPromise = null;
        reject(new Error('No se pudo cargar el plugin de Bluetooth'));
      }
    }, { once: true });
    script.addEventListener('error', function () {
      bleLoadPromise = null;
      reject(new Error('No se pudo cargar el plugin de Bluetooth'));
    }, { once: true });
    document.head.appendChild(script);
  });
  return bleLoadPromise;
}

var bleInitPromise = null;

function nativeBle() {
  return loadBleClient().then(function (BleClient) {
    if (bleInitPromise) return bleInitPromise.then(function () { return BleClient; });
    bleInitPromise = BleClient.initialize().catch(function (err) {
      bleInitPromise = null;
      throw err;
    });
    return bleInitPromise.then(function () { return BleClient; });
  });
}

// ----------------------------------------------------------
// Estado y preferencias (comunes a ambos transportes)
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
 * La impresora está vinculada pero hay que volver a elegirla en la lista.
 * Pasa al recargar la página (p. ej. al cerrar sesión): ni Chrome ni el
 * plugin nativo dejan recuperar el dispositivo sin que el usuario lo elija
 * otra vez (salvo que Web Bluetooth sí lo recuerde vía getDevices()).
 */
function needsReselect() {
  if (!isPaired() || state.deviceId) return false;
  if (state.lost) return true;
  var kind = getTransportKind();
  if (kind === 'web') return !navigator.bluetooth || typeof navigator.bluetooth.getDevices !== 'function';
  // El plugin nativo no tiene equivalente a getDevices(): siempre hay que
  // volver a elegir la impresora tras recargar la página.
  return kind === 'native';
}

function deviceName() {
  return state.deviceName || '';
}

function forget() {
  disconnect();
  state.deviceId = null;
  state.deviceName = '';
  state.webDevice = null;
  state.lost = false;
  storage(STORAGE_DEVICE, null);
  notifyChange();
}

// ----------------------------------------------------------
// Conexión — Web Bluetooth (Chrome)
// ----------------------------------------------------------
function pairWeb() {
  return navigator.bluetooth
    .requestDevice({
      // Se listan todos: muchas impresoras no anuncian su servicio y no aparecerían con filtros
      acceptAllDevices: true,
      optionalServices: SERVICES,
    })
    .then(function (device) {
      disconnect();
      state.webDevice = device;
      state.deviceId = device.id;
      state.deviceName = device.name || '';
      state.lost = false;
      storage(STORAGE_DEVICE, device.id);
      return connectWeb(device);
    });
}

function connectWeb(device) {
  if (!device.__monayListener) {
    device.addEventListener('gattserverdisconnected', markDisconnected);
    device.__monayListener = true;
  }
  return withTimeout(device.gatt.connect(), CONNECT_TIMEOUT_MS, CONNECT_TIMEOUT_MESSAGE)
    .then(findWritableWeb)
    .then(markConnected);
}

function findWritableWeb(server) {
  return server.getPrimaryServices().then(function (services) {
    var ordered = orderServices(services, function (s) { return s.uuid; });
    var tryService = function (i) {
      if (i >= ordered.length) {
        throw PrinterError('Este dispositivo no parece una impresora compatible');
      }
      return ordered[i]
        .getCharacteristics()
        .then(function (chars) {
          var writable = chars.filter(function (c) {
            return c.properties.writeWithoutResponse || c.properties.write;
          })[0];
          return writable || tryService(i + 1);
        })
        .catch(function () { return tryService(i + 1); });
    };
    return tryService(0);
  });
}

/** Busca la impresora vinculada sin pedir permiso de nuevo (Chrome recuerda el permiso). */
function rememberedWebDevice() {
  if (state.webDevice) return Promise.resolve(state.webDevice);
  var lost = function () {
    state.lost = true;
    return PrinterError('Toque "Conectar impresora" y elíjala en la lista');
  };
  if (typeof navigator.bluetooth.getDevices !== 'function') return Promise.reject(lost());
  var savedId = storage(STORAGE_DEVICE);
  return navigator.bluetooth.getDevices().then(function (devices) {
    var device = devices.filter(function (d) { return d.id === savedId; })[0];
    if (!device) throw lost();
    state.webDevice = device;
    return device;
  });
}

function ensureConnectedWeb() {
  if (isConnected()) return Promise.resolve(state.writable);
  if (!isPaired()) return Promise.reject(PrinterError('No hay impresora vinculada'));
  return rememberedWebDevice().then(connectWeb);
}

function sendWeb(bytes) {
  var characteristic = state.writable;
  return sendChunked(bytes, function (chunk) {
    if (characteristic.properties.writeWithoutResponse) {
      // Sin confirmación: pausa para no saturar el búfer de impresoras baratas
      return characteristic.writeValueWithoutResponse(chunk).then(function () { return delay(PACE_MS); });
    }
    return characteristic.writeValueWithResponse
      ? characteristic.writeValueWithResponse(chunk)
      : characteristic.writeValue(chunk);
  });
}

// ----------------------------------------------------------
// Conexión — plugin nativo (Capacitor, @capacitor-community/bluetooth-le)
// ----------------------------------------------------------
function pairNative() {
  return nativeBle().then(function (BleClient) {
    return BleClient.requestDevice({ optionalServices: SERVICES }).then(function (device) {
      disconnect();
      state.deviceId = device.deviceId;
      state.deviceName = device.name || '';
      state.lost = false;
      storage(STORAGE_DEVICE, device.deviceId);
      return connectNative(BleClient, device.deviceId);
    });
  });
}

function connectNative(BleClient, deviceId) {
  return withTimeout(BleClient.connect(deviceId, markDisconnected), CONNECT_TIMEOUT_MS, CONNECT_TIMEOUT_MESSAGE)
    .then(function () { return BleClient.getServices(deviceId); })
    .then(function (services) {
      var ordered = orderServices(services, function (s) { return s.uuid; });
      for (var i = 0; i < ordered.length; i++) {
        var service = ordered[i];
        var characteristic = (service.characteristics || []).filter(function (c) {
          return c.properties && (c.properties.writeWithoutResponse || c.properties.write);
        })[0];
        if (characteristic) {
          return {
            serviceUuid: service.uuid,
            characteristicUuid: characteristic.uuid,
            writeWithoutResponse: !!characteristic.properties.writeWithoutResponse,
          };
        }
      }
      throw PrinterError('Este dispositivo no parece una impresora compatible');
    })
    .then(markConnected);
}

function ensureConnectedNative() {
  if (isConnected()) return Promise.resolve(state.writable);
  if (!isPaired()) return Promise.reject(PrinterError('No hay impresora vinculada'));
  if (!state.deviceId) {
    // No queda registro del dispositivo elegido en esta sesión de la app
    // (p. ej. tras cerrar sesión): el plugin nativo no tiene equivalente a
    // getDevices(), así que no hay forma de reconectar sin elegirlo de nuevo.
    state.lost = true;
    return Promise.reject(PrinterError('Toque "Conectar impresora" y elíjala en la lista'));
  }
  return nativeBle().then(function (BleClient) {
    return connectNative(BleClient, state.deviceId);
  });
}

function sendNative(bytes) {
  return nativeBle().then(function (BleClient) {
    var writable = state.writable;
    return sendChunked(bytes, function (chunk) {
      var array = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
      var value = new DataView(array.buffer, array.byteOffset, array.byteLength);
      if (writable.writeWithoutResponse) {
        return BleClient
          .writeWithoutResponse(state.deviceId, writable.serviceUuid, writable.characteristicUuid, value, { timeout: WRITE_TIMEOUT_MS })
          .then(function () { return delay(PACE_MS); });
      }
      return BleClient.write(state.deviceId, writable.serviceUuid, writable.characteristicUuid, value, { timeout: WRITE_TIMEOUT_MS });
    });
  });
}

// ----------------------------------------------------------
// Interfaz pública — despacha al transporte correspondiente
// ----------------------------------------------------------

/** Vincula una impresora (abre el selector; requiere un toque del usuario). */
function pair() {
  var kind = getTransportKind();
  if (kind === 'web') return pairWeb();
  if (kind === 'native') return pairNative();
  return Promise.reject(PrinterError('Este dispositivo no permite Bluetooth directo'));
}

/** Deja la conexión lista. Se puede llamar antes de cobrar para que imprimir sea inmediato. */
function ensureConnected() {
  var kind = getTransportKind();
  if (kind === 'web') return ensureConnectedWeb();
  if (kind === 'native') return ensureConnectedNative();
  return Promise.reject(PrinterError('No hay impresora vinculada'));
}

/** Conecta en segundo plano sin mostrar errores (al abrir el POS o al empezar a cobrar). */
function warmUp() {
  if (isSupported() && isPaired() && !isConnected()) ensureConnected().catch(function () {});
}

function disconnect() {
  var kind = getTransportKind();
  if (kind === 'web' && state.webDevice && state.webDevice.gatt && state.webDevice.gatt.connected) {
    state.webDevice.gatt.disconnect();
  } else if (kind === 'native' && state.deviceId && state.connected) {
    nativeBle().then(function (BleClient) {
      BleClient.disconnect(state.deviceId).catch(function () {});
    });
  }
  state.connected = false;
  state.writable = null;
}

function sendBytes(bytes) {
  return ensureConnected()
    .catch(function (err) {
      throw err.name === 'PrinterError' ? err : PrinterError(err.message || 'No se pudo conectar con la impresora');
    })
    .then(function () {
      var kind = getTransportKind();
      var sender = kind === 'native' ? sendNative : sendWeb;
      return sender(bytes);
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
  isSupported: isSupported,
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
  warmUp: warmUp,
  printReceipt: printReceipt,
  printTest: printTest,
};
