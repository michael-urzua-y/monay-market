// ============================================================
// Monay Market POS — Impresora térmica por Bluetooth directo (Web Bluetooth)
//
// Reemplaza a RawBT: la app se conecta sola a la impresora y le envía la
// boleta en ESC/POS (ver receipt-escpos.js), sin diálogo de impresión.
//
// Requisitos: Chrome en Android y una impresora con Bluetooth LE (4.0+).
// Las que solo tienen Bluetooth "clásico" no aparecen al vincular: para esas
// la app sigue usando window.print() + RawBT.
// ============================================================

import { buildReceipt, buildTestTicket } from './receipt-escpos.js?v=38'; // misma versión que en app.js

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

var state = {
  device: null,
  characteristic: null,
  connecting: null,
  chunkSize: CHUNK_LARGE,
  // Hay una impresora guardada pero este navegador no la entrega de nuevo sin elegirla
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
// Estado y preferencias
// ----------------------------------------------------------
function isSupported() {
  return !!(navigator.bluetooth && typeof navigator.bluetooth.requestDevice === 'function');
}

/** Hay una impresora vinculada en este dispositivo. */
function isPaired() {
  return !!(state.device || storage(STORAGE_DEVICE));
}

function isConnected() {
  return !!(state.characteristic && state.device && state.device.gatt && state.device.gatt.connected);
}

function getPaper() {
  return storage(STORAGE_PAPER) === '80' ? 80 : 58;
}

function setPaper(mm) {
  storage(STORAGE_PAPER, mm === 80 ? '80' : '58');
}

/**
 * La impresora está vinculada pero hay que volver a elegirla en la lista de Chrome.
 * Pasa al recargar la página (p. ej. al cerrar sesión): Chrome en Android no deja
 * recuperar el dispositivo sin que el usuario lo elija otra vez.
 */
function needsReselect() {
  if (!isPaired() || state.device) return false;
  return state.lost || !navigator.bluetooth || typeof navigator.bluetooth.getDevices !== 'function';
}

function deviceName() {
  return (state.device && state.device.name) || '';
}

function forget() {
  disconnect();
  if (state.device && typeof state.device.forget === 'function') {
    state.device.forget().catch(function () {});
  }
  state.device = null;
  state.lost = false;
  storage(STORAGE_DEVICE, null);
}

// ----------------------------------------------------------
// Conexión
// ----------------------------------------------------------

/** Vincula una impresora (abre el selector de Chrome; requiere un toque del usuario). */
function pair() {
  if (!isSupported()) return Promise.reject(PrinterError('Este navegador no permite Bluetooth directo'));
  return navigator.bluetooth
    .requestDevice({
      // Se listan todos: muchas impresoras no anuncian su servicio y no aparecerían con filtros
      acceptAllDevices: true,
      optionalServices: SERVICES,
    })
    .then(function (device) {
      disconnect();
      state.device = device;
      state.lost = false;
      storage(STORAGE_DEVICE, device.id);
      return connect(device);
    });
}

function connect(device) {
  if (!device.__monayListener) {
    device.addEventListener('gattserverdisconnected', function () {
      state.characteristic = null;
    });
    device.__monayListener = true;
  }
  return withTimeout(device.gatt.connect(), CONNECT_TIMEOUT_MS, 'La impresora no responde. ¿Está encendida y cerca?')
    .then(findWritable)
    .then(function (characteristic) {
      state.characteristic = characteristic;
      return characteristic;
    });
}

function findWritable(server) {
  return server.getPrimaryServices().then(function (services) {
    var preferred = services.filter(function (s) { return SERVICES.indexOf(s.uuid) >= 0; });
    var others = services.filter(function (s) { return SERVICES.indexOf(s.uuid) < 0; });
    var ordered = preferred.concat(others);
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
function rememberedDevice() {
  if (state.device) return Promise.resolve(state.device);
  var lost = function () {
    state.lost = true;
    return PrinterError('Toque "Conectar impresora" y elíjala en la lista');
  };
  if (typeof navigator.bluetooth.getDevices !== 'function') return Promise.reject(lost());
  var savedId = storage(STORAGE_DEVICE);
  return navigator.bluetooth.getDevices().then(function (devices) {
    var device = devices.filter(function (d) { return d.id === savedId; })[0];
    if (!device) throw lost();
    state.device = device;
    return device;
  });
}

/** Deja la conexión lista. Se puede llamar antes de cobrar para que imprimir sea inmediato. */
function ensureConnected() {
  if (isConnected()) return Promise.resolve(state.characteristic);
  if (!isSupported() || !isPaired()) return Promise.reject(PrinterError('No hay impresora vinculada'));
  if (state.connecting) return state.connecting;
  state.connecting = rememberedDevice()
    .then(connect)
    .finally(function () { state.connecting = null; });
  return state.connecting;
}

/** Conecta en segundo plano sin mostrar errores (al abrir el POS o al empezar a cobrar). */
function warmUp() {
  if (isSupported() && isPaired() && !isConnected()) ensureConnected().catch(function () {});
}

function disconnect() {
  if (state.device && state.device.gatt && state.device.gatt.connected) state.device.gatt.disconnect();
  state.characteristic = null;
}

// ----------------------------------------------------------
// Envío
// ----------------------------------------------------------
function writeChunk(characteristic, chunk) {
  if (characteristic.properties.writeWithoutResponse) {
    return characteristic.writeValueWithoutResponse(chunk).then(function () { return delay(PACE_MS); });
  }
  // Con confirmación: la impresora regula el ritmo, no hace falta pausa
  return characteristic.writeValueWithResponse
    ? characteristic.writeValueWithResponse(chunk)
    : characteristic.writeValue(chunk);
}

function send(characteristic, bytes) {
  var offset = 0;
  function next() {
    if (offset >= bytes.length) return Promise.resolve();
    var size = state.chunkSize;
    var chunk = bytes.slice(offset, offset + size);
    return writeChunk(characteristic, chunk).then(
      function () {
        offset += chunk.length;
        return next();
      },
      function (err) {
        // Primer envío rechazado por tamaño: se reintenta con el mínimo garantizado
        if (offset === 0 && state.chunkSize > CHUNK_SAFE) {
          state.chunkSize = CHUNK_SAFE;
          return next();
        }
        throw PrinterError('Se cortó la conexión con la impresora', offset > 0 || !!err.started);
      },
    );
  }
  return next();
}

function sendBytes(bytes) {
  return ensureConnected()
    .catch(function (err) {
      throw err.name === 'PrinterError' ? err : PrinterError(err.message || 'No se pudo conectar con la impresora');
    })
    .then(function (characteristic) { return send(characteristic, bytes); });
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
