// ============================================================
// Monay Market POS — Cobro con tarjeta vía SumUp Tap to Pay
//
// Abre la app de SumUp con el monto del carrito cargado para que el
// cliente pague acercando su tarjeta al celular del cajero (sin máquina
// POS aparte). SumUp cobra y vuelve sola a esta misma página con el
// resultado por parámetros de URL.
//
// El cobro navega fuera de la página (abre otra app), así que la venta
// NO se puede crear antes de cobrar (si el cajero no vuelve, quedaría
// "cobrada" pero sin registrar) ni queda bien crearla después sin más
// (si cierra Chrome en vez de volver, se pierde el registro). Por eso
// el carrito se guarda en localStorage ANTES de abrir SumUp, y recién
// se crea la venta en Monay cuando SumUp confirma el pago al volver.
// ============================================================

var STORE_KEY = 'monay_pos_sumup_pending';
var CONFIG_KEY = 'monay_pos_sumup_config';
var DEFAULT_APP_ID = 'cl.monaymarket.pos';

function readJSON(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch (e) {
    return null;
  }
}

function writeJSON(key, value) {
  try {
    if (value == null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch (e) {
    // Sin almacenamiento disponible: el cobro no podrá reanudarse al volver.
  }
}

// ----------------------------------------------------------
// Configuración (clave de afiliado): se pide una sola vez por celular
// ----------------------------------------------------------
function getConfig() {
  return readJSON(CONFIG_KEY) || {};
}

function isConfigured() {
  var config = getConfig();
  return !!(config.affiliateKey && config.affiliateKey.trim());
}

function setAffiliateKey(key) {
  writeJSON(CONFIG_KEY, { affiliateKey: (key || '').trim() });
}

function clearConfig() {
  writeJSON(CONFIG_KEY, null);
}

// ----------------------------------------------------------
// Iniciar el cobro: guarda el carrito pendiente y abre SumUp
// ----------------------------------------------------------
function chargeAndRedirect(saleBody, totalAmount) {
  var config = getConfig();
  if (!config.affiliateKey) {
    return { ok: false, reason: 'not-configured' };
  }

  var txId = 'monay-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  var back = location.origin + location.pathname;

  writeJSON(STORE_KEY, {
    txId: txId,
    saleBody: saleBody,
    amount: totalAmount,
    createdAt: Date.now(),
  });

  var query = new URLSearchParams({
    'affiliate-key': config.affiliateKey,
    'app-id': DEFAULT_APP_ID,
    'total': String(totalAmount),
    'currency': 'CLP',
    'title': 'Venta Monay Market',
    'foreign-tx-id': txId,
    // Android usa "callback"; iOS usa "callbacksuccess"/"callbackfail".
    'callback': back + '?smp-tx=' + txId,
    'callbacksuccess': back + '?smp-tx=' + txId,
    'callbackfail': back + '?smp-tx=' + txId,
  });

  location.href = 'sumupmerchant://pay/1.0?' + query.toString();
  return { ok: true };
}

// ----------------------------------------------------------
// Al volver de SumUp: resolver el cobro pendiente
// ----------------------------------------------------------
function consumePendingReturn() {
  var params = new URLSearchParams(location.search);
  if (!params.has('smp-status') && !params.has('smp-tx')) return null;

  var pending = readJSON(STORE_KEY);
  // Limpiamos la URL y el pendiente guardado de inmediato para no
  // reprocesar el mismo resultado si la página se recarga después.
  history.replaceState(null, '', location.pathname);
  writeJSON(STORE_KEY, null);

  if (!pending) {
    return { status: 'orphan', params: params };
  }

  var status = params.get('smp-status');
  var approved = status === 'success';

  return {
    status: approved ? 'approved' : 'declined',
    saleBody: pending.saleBody,
    amount: pending.amount,
    transactionCode: params.get('smp-tx-code') || null,
    message: params.get('smp-message') || null,
    params: params,
  };
}

function hasStuckPending() {
  var pending = readJSON(STORE_KEY);
  return !!pending;
}

function discardPending() {
  writeJSON(STORE_KEY, null);
}

export var SumUp = {
  isConfigured: isConfigured,
  getConfig: getConfig,
  setAffiliateKey: setAffiliateKey,
  clearConfig: clearConfig,
  chargeAndRedirect: chargeAndRedirect,
  consumePendingReturn: consumePendingReturn,
  hasStuckPending: hasStuckPending,
  discardPending: discardPending,
};
