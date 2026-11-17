// ============================================================
// Monay Market — Cobro con tarjeta en el celular (SumUp Tap to Pay)
// ============================================================
// El cliente acerca su tarjeta al celular del cajero e ingresa su PIN en la
// pantalla de SumUp. La parte nativa es el plugin SumUpTapToPay de la app
// (android/.../SumUpTapToPayPlugin.kt).
//
// Las claves de SumUp del negocio las configura el dueño en el panel y el
// servidor las entrega solo al cajero con sesión (GET /tenant/card-payment).
// Quedan en memoria: nunca se guardan en el celular.

import { api } from './api.js';
import { isNativeApp, loadCapacitorCore } from './platform.js?v=56';

var state = {
  ready: false,
  affiliateKey: null,
  preparing: null,
  unavailableReason: 'El cobro con tarjeta no está activo en este negocio.',
};

// La primera vez SumUp registra el celular y puede tardar; si pasa de esto, se avisa
var INIT_TIMEOUT_MS = 60000;

var NOT_ENABLED = 'El cobro con tarjeta no está activo. El dueño debe activarlo en el panel: Configuración → Cobro con tarjeta.';
var sumUpPlugin = null;

/**
 * Ejecuta fn con el plugin nativo SumUpTapToPay. Ojo: el plugin es un Proxy de
 * Capacitor que responde a cualquier nombre, incluido "then"; si se devuelve
 * como resultado de una promesa, JavaScript lo trata como otra promesa y queda
 * esperando para siempre. Por eso se guarda aparte y nunca se resuelve con él.
 */
function withPlugin(fn) {
  return loadCapacitorCore().then(function (core) {
    if (!sumUpPlugin) sumUpPlugin = core.registerPlugin('SumUpTapToPay');
    return fn(sumUpPlugin);
  });
}

function notifyChange() {
  window.dispatchEvent(new Event('monay-card-payment-change'));
}

/** El cobro con tarjeta está listo para usarse en este celular. */
function isReady() {
  return state.ready;
}

/** Por qué no se puede cobrar con tarjeta (para explicárselo al cajero). */
function unavailableReason() {
  return state.unavailableReason;
}

/**
 * Pide las claves al servidor y prepara el SDK. Se llama al abrir la caja con
 * sesión; si el negocio no tiene el cobro con tarjeta activo, queda deshabilitado.
 */
function prepare() {
  if (!isNativeApp()) return Promise.resolve(false);
  if (state.preparing) return state.preparing;

  state.preparing = api.get('/tenant/card-payment', { label: 'Preparando cobro con tarjeta' })
    .then(function (config) {
      if (!config || !config.enabled || !config.access_token || !config.affiliate_key) {
        state.unavailableReason = NOT_ENABLED;
        return false;
      }
      return withPlugin(function (SumUp) {
        return withTimeout(SumUp.init({ accessToken: config.access_token }), INIT_TIMEOUT_MS);
      }).then(function () {
        state.affiliateKey = config.affiliate_key;
        state.unavailableReason = null;
        return true;
      }, function (err) {
        // SumUp no inició: se muestra su código para poder diagnosticarlo
        state.unavailableReason = initFailureMessage(err);
        console.warn('[Tarjeta] SumUp no inició:', err && err.code, err && err.message);
        return false;
      });
    })
    .catch(function (err) {
      // Sin configuración (404) o sin internet: se cobra solo en efectivo
      state.unavailableReason = err && err.status === 404 ? NOT_ENABLED
        : 'No se pudo consultar el cobro con tarjeta. Revise internet y vuelva a tocar "Tarjeta".';
      console.warn('[Tarjeta] Cobro con tarjeta no disponible:', err && (err.message || err));
      return false;
    })
    .then(function (ready) {
      state.ready = ready;
      if (!ready) state.affiliateKey = null;
      state.preparing = null;
      notifyChange();
      return ready;
    });
  return state.preparing;
}

/**
 * Cobra con tarjeta. Resuelve siempre con { status, txCode, message, ... }:
 *  - approved: cobro aprobado (txCode = código de transacción de SumUp)
 *  - canceled: el cajero o el cliente cancelaron
 *  - failed:   rechazada o error (message explica)
 *  - unknown:  no se sabe si se cobró (p. ej. se cortó internet): revisar en SumUp
 */
function charge(options) {
  if (!state.ready) {
    return Promise.reject(new Error('El cobro con tarjeta no está disponible'));
  }
  return withPlugin(function (SumUp) {
    return SumUp.startPayment({
      amount: Math.round(options.amount),
      processCardAs: options.cardType,
      instalments: 1,
      affiliateKey: state.affiliateKey,
      foreignTransactionId: options.saleId || null,
    });
  });
}

/** Al cerrar sesión: borra la sesión de SumUp y las claves de la memoria. */
function reset() {
  var wasReady = state.ready;
  state.ready = false;
  state.affiliateKey = null;
  state.unavailableReason = NOT_ENABLED;
  notifyChange();
  if (!wasReady) return Promise.resolve();
  return withPlugin(function (SumUp) { return SumUp.tearDown(); }).catch(function () {});
}

function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () {
      var err = new Error('SumUp no respondió');
      err.code = 'TIMEOUT';
      reject(err);
    }, ms);
    promise.then(function (value) { clearTimeout(timer); resolve(value); },
      function (err) { clearTimeout(timer); reject(err); });
  });
}

/** Error al preparar SumUp (init). El código va al final para diagnosticar. */
function initFailureMessage(err) {
  if (err && err.code === 'TIMEOUT') {
    return 'SumUp no respondió al preparar el cobro. Revise internet, cierre y abra la app, y vuelva a tocar "Tarjeta".';
  }
  var code = Number(err && err.code);
  var detail = ' (código ' + ((err && err.code) || '?') + ')';
  if (code === 105 || code === 202) {
    return 'SumUp rechazó la clave de API del negocio. Revise la clave en el panel' + detail + '.';
  }
  if (code >= 301 && code <= 305) {
    return 'SumUp bloqueó este celular por seguridad: desactive la Depuración USB y las Opciones de desarrollador y abra la app de nuevo' + detail + '.';
  }
  if (code === 103 || code === 110) return 'SumUp no pudo registrar este celular. Intente de nuevo en unos minutos' + detail + '.';
  if (code >= 201 && code <= 206) return 'Sin conexión con SumUp. Revise internet y vuelva a tocar "Tarjeta"' + detail + '.';
  return 'No se pudo preparar el cobro con tarjeta: ' + ((err && err.message) || 'error de SumUp') + detail + '.';
}

/** Mensaje para el cajero según el código de error del SDK (docs: Exceptions and Error Codes). */
function failureMessage(result) {
  var code = Number(result && result.code);
  if (code === 1025 || code === 1029) return 'Tarjeta rechazada. Pida otro medio de pago.';
  if (code === 1003) return 'Se acabó el tiempo para acercar la tarjeta.';
  if (code >= 201 && code <= 206) return 'Sin conexión con SumUp. Revise internet y vuelva a intentar.';
  if (code >= 301 && code <= 305) {
    return 'SumUp bloqueó el cobro por seguridad del celular: desactive las Opciones de desarrollador y la Depuración USB.';
  }
  if (code === 106) return 'SumUp pide actualizar la app de la caja.';
  return 'No se pudo cobrar con tarjeta' + (result && result.message ? ': ' + result.message : '') +
    ' (código ' + ((result && result.code) || '?') + ').';
}

export var CardPayment = {
  isReady: isReady,
  unavailableReason: unavailableReason,
  prepare: prepare,
  charge: charge,
  reset: reset,
  failureMessage: failureMessage,
};
