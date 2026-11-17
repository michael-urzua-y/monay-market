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
import { isNativeApp, loadCapacitorCore } from './platform.js?v=51';

var state = {
  ready: false,
  affiliateKey: null,
  preparing: null,
};
var pluginPromise = null;

function plugin() {
  if (!pluginPromise) {
    pluginPromise = loadCapacitorCore().then(function (core) {
      return core.registerPlugin('SumUpTapToPay');
    }).catch(function (err) {
      pluginPromise = null;
      throw err;
    });
  }
  return pluginPromise;
}

function notifyChange() {
  window.dispatchEvent(new Event('monay-card-payment-change'));
}

/** El cobro con tarjeta está listo para usarse en este celular. */
function isReady() {
  return state.ready;
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
        return false;
      }
      return plugin().then(function (SumUp) {
        return SumUp.init({ accessToken: config.access_token });
      }).then(function () {
        state.affiliateKey = config.affiliate_key;
        return true;
      });
    })
    .catch(function (err) {
      // Sin configuración (404), sin internet o SumUp no inició: se cobra solo en efectivo
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
  return plugin().then(function (SumUp) {
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
  notifyChange();
  if (!wasReady) return Promise.resolve();
  return plugin().then(function (SumUp) { return SumUp.tearDown(); }).catch(function () {});
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
  return 'No se pudo cobrar con tarjeta' + (result && result.message ? ': ' + result.message : '.');
}

export var CardPayment = {
  isReady: isReady,
  prepare: prepare,
  charge: charge,
  reset: reset,
  failureMessage: failureMessage,
};
