// ============================================================
// Monay Market POS — Main Application
// Vanilla JS PWA with screen routing and API client
// ============================================================

import { api, CONFIG } from './api.js';
import { OfflineDB } from './offline.js';
import { Cart } from './cart.js';

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------
  var APP_ASSET_VERSION = '30';
  var RECEIPT_TIME_ZONE = 'America/Santiago';
  var bwipJsLoadPromise = null;

  function formatCLP(amount) {
    if (amount == null) return '$0';
    const abs = Math.abs(amount);
    const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (amount < 0 ? '-$' : '$') + formatted;
  }

  function formatTime(dateStr) {
    var parts = getChileDateParts(dateStr);
    if (!parts) return '—';
    return parts.hour24 + ':' + parts.minute;
  }

  function formatDate(dateStr) {
    var parts = getChileDateParts(dateStr);
    if (!parts) return '—';
    return parts.day + '-' + parts.month + '-' + parts.year + ' ' + parts.hour24 + ':' + parts.minute;
  }

  function formatReceiptDate(dateStr) {
    var parts = getChileDateParts(dateStr);
    if (!parts) return '—';
    return parts.day + '-' + parts.month + '-' + parts.year;
  }

  function formatReceiptDateTime(dateStr) {
    var parts = getChileDateParts(dateStr);
    if (!parts) return '—';
    var suffix = parts.hour >= 12 ? 'p. m.' : 'a. m.';
    var hour12 = parts.hour % 12 || 12;
    return parts.day + '-' + parts.month + '-' + parts.year + ' ' +
      hour12 + ':' + parts.minute + ' ' + suffix;
  }

  function getChileDateParts(dateStr) {
    if (!dateStr) return null;
    var d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return null;
    var parts = new Intl.DateTimeFormat('es-CL', {
      timeZone: RECEIPT_TIME_ZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d).reduce(function (acc, part) {
      acc[part.type] = part.value;
      return acc;
    }, {});
    var hour = Number(parts.hour);
    if (hour === 24) hour = 0;
    return {
      day: parts.day,
      month: parts.month,
      year: parts.year,
      hour: hour,
      hour24: padReceiptNumber(hour),
      minute: parts.minute,
    };
  }

  function padReceiptNumber(value) {
    return String(value).padStart(2, '0');
  }

  function formatReceiptQuantity(quantity) {
    var n = Number(quantity);
    if (!Number.isFinite(n)) return quantity || 0;
    return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(3)));
  }

  // ----------------------------------------------------------
  // Critical stock notifications
  // ----------------------------------------------------------
  function notifyCriticalStock(alerts) {
    if (!alerts || alerts.length === 0) return;

    // Show in-app toast
    var names = alerts.map(function(a) { return a.name || a.product_name || 'Producto'; });
    showToast('⚠️ Stock crítico: ' + names.join(', '), 'warning');

    // Request browser notification permission and show notification
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        sendStockNotification(alerts);
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(function(perm) {
          if (perm === 'granted') sendStockNotification(alerts);
        });
      }
    }
  }

  function sendStockNotification(alerts) {
    var body = alerts.map(function(a) {
      return (a.name || a.product_name) + ' (stock: ' + (a.stock || a.current_stock || 0) + ')';
    }).join('\n');

    try {
      new Notification('⚠️ Stock Crítico - Monay POS', {
        body: body,
        icon: 'icons/icon-192x192.png',
        tag: 'critical-stock',
        renotify: true,
      });
    } catch (e) {
      // Notification API not available in this context
    }
  }

  // ----------------------------------------------------------
  // Toast notifications
  // ----------------------------------------------------------
  let toastTimer = null;
  var autoPrintState = {
    inFlight: false,
    lastSaleId: null,
  };
  var authRedirectInFlight = false;

  function showToast(message, type) {
    type = type || 'error';
    let toast = document.getElementById('app-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'app-toast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('show');
    }, 3000);
  }

  // ----------------------------------------------------------
  // Global loading state
  // ----------------------------------------------------------
  var loadingState = {
    nextId: 0,
    pending: new Map(),
    overlayTimer: null,
    overlayVisible: false,
    baseTitle: document.title,
  };

  function startActivity(label, options) {
    options = options || {};
    var id = 'activity-' + (++loadingState.nextId);
    loadingState.pending.set(id, {
      id: id,
      label: label || 'Procesando...',
      message: options.message || '',
      blocking: !!options.blocking,
      source: options.source || 'manual',
    });
    syncLoadingUI();
    return id;
  }

  function finishActivity(id) {
    if (!id) return;
    if (loadingState.pending.delete(id)) {
      syncLoadingUI();
    }
  }

  function getTopActivity() {
    var entries = Array.from(loadingState.pending.values());
    if (entries.length === 0) return null;
    for (var i = entries.length - 1; i >= 0; i--) {
      if (entries[i].blocking) return entries[i];
    }
    return entries[entries.length - 1];
  }

  function setButtonLoading(button, isLoading, options) {
    options = options || {};
    if (!button) return;

    if (isLoading) {
      if (button.dataset.loading === 'true') return;
      button.dataset.loading = 'true';
      button.dataset.prevDisabled = button.disabled ? 'true' : 'false';
      button.dataset.originalHtml = button.innerHTML;
      button.classList.add('is-loading');
      if (options.label) {
        button.textContent = options.label;
      }
      if (!button.style.minWidth) {
        button.style.minWidth = button.offsetWidth + 'px';
      }
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      return;
    }

    if (button.dataset.originalHtml != null) {
      button.innerHTML = button.dataset.originalHtml;
    }
    button.classList.remove('is-loading');
    button.dataset.loading = 'false';
    button.disabled = button.dataset.prevDisabled === 'true';
    button.removeAttribute('aria-busy');
    button.style.minWidth = '';
  }

  function isButtonLoading(button) {
    return !!button && button.dataset.loading === 'true';
  }

  function setSearchLoading(isLoading, message) {
    var input = document.getElementById('product-search');
    var resultsEl = document.getElementById('search-results');
    if (!input || !resultsEl) return;

    input.classList.toggle('is-loading', isLoading);
    resultsEl.classList.toggle('is-loading', isLoading);
    if (isLoading) {
      resultsEl.innerHTML =
        '<div class="search-loading">' +
        '<span class="inline-spinner" aria-hidden="true"></span>' +
        '<span>' + escapeHtml(message || 'Buscando productos...') + '</span>' +
        '</div>';
      resultsEl.classList.remove('hidden');
      return;
    }

    resultsEl.classList.remove('is-loading');
  }

  function syncLoadingUI() {
    var overlay = document.getElementById('global-loading-overlay');
    var titleEl = document.getElementById('global-loading-title');
    var messageEl = document.getElementById('global-loading-message');
    var count = loadingState.pending.size;
    var activity = getTopActivity();
    var isBooting = document.body.classList.contains('app-booting');

    clearTimeout(loadingState.overlayTimer);

    document.body.classList.toggle('app-has-loading', count > 0 || isBooting);
    document.title = count > 0
      ? 'Procesando... (' + count + ') | ' + loadingState.baseTitle
      : loadingState.baseTitle;

    if (!overlay || !titleEl || !messageEl) return;

    if (count === 0 && !isBooting) {
      loadingState.overlayVisible = false;
      overlay.classList.remove('is-visible');
      overlay.dataset.mode = 'soft';
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('app-loading-blocking');
      return;
    }

    if (activity && activity.blocking) {
      loadingState.overlayVisible = true;
    } else if (count > 0) {
      loadingState.overlayTimer = setTimeout(function () {
        if (loadingState.pending.size > 0 && !document.body.classList.contains('app-booting')) {
          loadingState.overlayVisible = true;
          syncLoadingUI();
        }
      }, 160);
    }

    if (!loadingState.overlayVisible && !isBooting) {
      overlay.classList.remove('is-visible');
      overlay.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('app-loading-blocking');
      return;
    }

    var label = activity && activity.label ? activity.label : 'Iniciando POS';
    var message = activity && activity.message
      ? activity.message
      : (count > 1 ? count + ' operaciones en curso' : 'Un momento por favor');
    var isBlocking = isBooting || !!(activity && activity.blocking);

    titleEl.textContent = label;
    messageEl.textContent = message;
    overlay.dataset.mode = isBlocking ? 'blocking' : 'soft';
    overlay.classList.add('is-visible');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.toggle('app-loading-blocking', isBlocking);
  }

  function releaseBootState() {
    document.body.classList.remove('app-booting');
    syncLoadingUI();
  }

  window.addEventListener('monay-request-start', function (event) {
    var detail = event.detail || {};
    if (!detail.requestId) return;
    loadingState.pending.set(detail.requestId, {
      id: detail.requestId,
      label: detail.label || 'Actualizando POS',
      blocking: !!detail.blocking,
      message: '',
      source: detail.source || 'api',
    });
    syncLoadingUI();
  });

  window.addEventListener('monay-request-end', function (event) {
    var detail = event.detail || {};
    if (!detail.requestId) return;
    if (loadingState.pending.delete(detail.requestId)) {
      syncLoadingUI();
    }
  });

  // ----------------------------------------------------------
  // Confirm dialog
  // ----------------------------------------------------------
  function showConfirm(message) {
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';
      overlay.innerHTML =
        '<div class="confirm-dialog">' +
        '<p>' + message + '</p>' +
        '<div class="confirm-actions">' +
        '<button class="btn btn-secondary" data-action="cancel">Cancelar</button>' +
        '<button class="btn btn-danger" data-action="confirm">Confirmar</button>' +
        '</div></div>';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', function (e) {
        var action = e.target.dataset.action;
        if (action) {
          document.body.removeChild(overlay);
          resolve(action === 'confirm');
        }
      });
    });
  }

  // ----------------------------------------------------------
  // Router — simple screen-based navigation
  // ----------------------------------------------------------
  var router = {
    currentScreen: null,
    screens: ['sale', 'history', 'receipt', 'arqueo'],
    navigate: function (screenId) {
      this.screens.forEach(function (id) {
        var el = document.getElementById('screen-' + id);
        if (el) {
          el.classList.add('hidden');
          el.classList.remove('active');
        }
      });
      var target = document.getElementById('screen-' + screenId);
      if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
      }
      var header = document.getElementById('app-header');
      if (header) {
        header.classList.remove('hidden');
      }
      document.querySelectorAll('.nav-btn').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.screen === screenId);
      });
      this.currentScreen = screenId;

      // Hacer scroll siempre hacia arriba al cambiar de pantalla
      window.scrollTo(0, 0);

      // Trigger screen-specific actions
      if (screenId === 'history') {
        loadHistory();
      }
      if (screenId === 'sale') {
        updateCartUI();
      }
    },
  };

  // ----------------------------------------------------------
  // Cart State
  // ----------------------------------------------------------

  function updateCartUI() {
    var container = document.getElementById('cart-items');
    var totalEl = document.getElementById('cart-total');
    if (!container || !totalEl) return;

    if (Cart.items.length === 0) {
      container.innerHTML = '<p class="cart-empty">El carrito está vacío</p>';
      totalEl.textContent = '$0';
      updatePaymentState();
      return;
    }

    var html = '';
    for (var i = 0; i < Cart.items.length; i++) {
      var item = Cart.items[i];
      
      var qtyHtml = '';
      if (item.is_weighed) {
        qtyHtml = '<span class="qty-value" style="margin: 0 10px; font-size: 0.9rem; color: var(--color-primary); font-weight: 600;">' + Number(item.quantity).toFixed(3) + ' Kg</span>';
      } else {
        qtyHtml = '<button class="qty-btn" data-action="dec" data-id="' + item.product_id + '">−</button>' +
                  '<span class="qty-value">' + item.quantity + '</span>' +
                  '<button class="qty-btn" data-action="inc" data-id="' + item.product_id + '">+</button>';
      }

      html +=
        '<div class="cart-item" data-product-id="' + item.product_id + '">' +
        '<div class="cart-item-info">' +
        '<div class="cart-item-name">' + escapeHtml(item.product_name) + '</div>' +
        '<div class="cart-item-price">' + formatCLP(item.unit_price) + ' ' + (item.is_weighed ? 'x Kg' : 'c/u') + '</div>' +
        '</div>' +
        '<div class="cart-item-qty">' + qtyHtml + '</div>' +
        '<div class="cart-item-subtotal">' + formatCLP(item.subtotal) + '</div>' +
        '<button class="cart-item-remove" data-action="remove" data-id="' + item.product_id + '">✕</button>' +
        '</div>';
    }
    container.innerHTML = html;
    totalEl.textContent = formatCLP(Cart.getTotal());
    updatePaymentState();
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return escapeHtml(str == null ? '' : String(str))
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderReceiptTimbres(root) {
    if (!root) return;
    root.querySelectorAll('canvas[data-receipt-timbre]').forEach(function (canvas) {
      var value = (canvas.getAttribute('data-receipt-timbre') || '').trim();
      var renderPromise = renderReceiptTimbrePdf417(canvas, value);
      canvas.__receiptTimbrePromise = renderPromise;
    });
  }

  function renderReceiptTimbrePdf417(canvas, value) {
    if (!value) {
      renderReceiptTimbreUnavailable(canvas, 'Timbre no recibido desde API Gateway');
      return Promise.resolve(false);
    }

    return waitForBwipJs(4000)
      .then(function (bwipjs) {
        try {
          bwipjs.toCanvas(canvas, {
            bcid: 'pdf417',
            text: value,
            scale: 2,
            includetext: false,
            paddingwidth: 0,
            paddingheight: 0,
          });
          canvas.dataset.receiptTimbreRendered = 'api-gateway';
          return true;
        } catch (e) {
          console.warn('No se pudo generar el PDF417 con el timbre de API Gateway', e);
          renderReceiptTimbreUnavailable(canvas, 'No se pudo generar el timbre PDF417');
          return false;
        }
      })
      .catch(function (e) {
        console.warn('bwip-js no está disponible para generar el timbre PDF417', e);
        renderReceiptTimbreUnavailable(canvas, 'No se pudo cargar el generador PDF417');
        return false;
      });
  }

  function waitForBwipJs(timeoutMs) {
    if (window.bwipjs && typeof window.bwipjs.toCanvas === 'function') {
      return Promise.resolve(window.bwipjs);
    }

    if (!bwipJsLoadPromise) {
      bwipJsLoadPromise = loadBwipJsScript();
    }

    return bwipJsLoadPromise.then(function () {
      return new Promise(function (resolve, reject) {
        var startedAt = Date.now();
        var timer = window.setInterval(function () {
          if (window.bwipjs && typeof window.bwipjs.toCanvas === 'function') {
            window.clearInterval(timer);
            resolve(window.bwipjs);
            return;
          }

          if (Date.now() - startedAt >= timeoutMs) {
            window.clearInterval(timer);
            reject(new Error('Timeout esperando bwip-js'));
          }
        }, 100);
      });
    });
  }

  function loadBwipJsScript() {
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-bwip-loader]');
      if (existing) {
        existing.addEventListener('load', function () { resolve(); }, { once: true });
        existing.addEventListener('error', function () {
          bwipJsLoadPromise = null;
          reject(new Error('No se pudo cargar bwip-js'));
        }, { once: true });
        return;
      }

      var script = document.createElement('script');
      script.src = 'src/vendor/bwip-js.min.js?v=' + APP_ASSET_VERSION;
      script.async = true;
      script.dataset.bwipLoader = 'true';
      script.addEventListener('load', function () {
        resolve();
      }, { once: true });
      script.addEventListener('error', function () {
        bwipJsLoadPromise = null;
        reject(new Error('No se pudo cargar bwip-js'));
      }, { once: true });
      document.head.appendChild(script);
    });
  }

  function renderReceiptTimbreUnavailable(canvas, message) {
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;

    var width = canvas.width || 520;
    var height = canvas.height || 128;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#6b7280';
    ctx.font = '18px Courier New, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message, width / 2, height / 2);
  }

  function formatProductStockLabel(product) {
    if (!product || product.tracks_stock === false) {
      return 'Sin control de stock';
    }
    return 'Stock: ' + product.stock;
  }

  // ----------------------------------------------------------
  // Product Search
  // ----------------------------------------------------------
  var searchTimer = null;
  var activeSearchRequest = 0;

  function initSearch() {
    var input = document.getElementById('product-search');
    var resultsEl = document.getElementById('search-results');
    if (!input || !resultsEl) return;

    input.addEventListener('input', function () {
      clearTimeout(searchTimer);
      var query = input.value.trim();
      if (query.length < 2) {
        activeSearchRequest += 1;
        setSearchLoading(false);
        resultsEl.classList.add('hidden');
        return;
      }
      searchTimer = setTimeout(function () {
        searchProducts(query);
      }, 300);
    });

    input.addEventListener('focus', function () {
      if (input.value.trim().length >= 2) {
        resultsEl.classList.remove('hidden');
      }
    });

    document.addEventListener('click', function (e) {
      if (!e.target.closest('.sale-search-bar')) {
        resultsEl.classList.add('hidden');
      }
    });

    resultsEl.addEventListener('click', function (e) {
      var item = e.target.closest('.search-result-item');
      if (item) {
        var product = JSON.parse(item.dataset.product);
        if (product.is_weighed) {
          openWeighModal(product);
        } else {
          Cart.add(product);
        }
        input.value = '';
        resultsEl.classList.add('hidden');
      }
    });
  }

  function searchProducts(query) {
    var resultsEl = document.getElementById('search-results');
    var requestId = ++activeSearchRequest;
    setSearchLoading(true, 'Buscando productos...');

    // First try exact barcode match
    api.get('/products?barcode=' + encodeURIComponent(query), {
      label: 'Consultando productos',
    }).then(function (products) {
      if (requestId !== activeSearchRequest) return;
      if (products && products.length > 0) {
        renderSearchResults(resultsEl, products);
        return;
      }
      // Fallback to name search
      return api.get('/products?name=' + encodeURIComponent(query), {
        label: 'Consultando productos',
      }).then(function (nameProducts) {
        if (requestId !== activeSearchRequest) return;
        renderSearchResults(resultsEl, nameProducts);
      });
    }).catch(function () {
      if (requestId !== activeSearchRequest) return;
      resultsEl.innerHTML = '<div class="search-no-results">Error al buscar</div>';
      resultsEl.classList.remove('hidden');
    }).finally(function () {
      if (requestId === activeSearchRequest) {
        setSearchLoading(false);
      }
    });
  }

  function renderSearchResults(resultsEl, products) {
    if (!products || products.length === 0) {
      resultsEl.innerHTML = '<div class="search-no-results">No se encontraron productos</div>';
    } else {
      var html = '';
      for (var i = 0; i < products.length; i++) {
        var p = products[i];
        var productData = JSON.stringify({
          id: p.id,
          name: p.name,
          price: p.price,
          stock: p.stock,
          is_weighed: p.is_weighed,
          tracks_stock: p.tracks_stock
        }).replace(/"/g, '&quot;');
        html +=
          '<div class="search-result-item" data-product="' + productData + '">' +
          '<div>' +
          '<div class="search-result-name">' + escapeHtml(p.name) + '</div>' +
          '<div class="search-result-stock">' + escapeHtml(formatProductStockLabel(p)) + '</div>' +
          '</div>' +
          '<div class="search-result-price">' + formatCLP(p.price) + '</div>' +
          '</div>';
      }
      resultsEl.innerHTML = html;
    }
    resultsEl.classList.remove('hidden');
  }

  // ----------------------------------------------------------
  // Weighing Modal
  // ----------------------------------------------------------
  var weighProduct = null;

  function initWeighModal() {
    var weightInput = document.getElementById('weigh-weight-input');
    var amountInput = document.getElementById('weigh-amount-input');
    var btnCancel = document.getElementById('btn-weigh-cancel');
    var btnConfirm = document.getElementById('btn-weigh-confirm');

    if(weightInput && amountInput) {
      weightInput.addEventListener('input', function() {
        if (!weighProduct) return;
        var w = parseFloat(weightInput.value);
        if (w > 0) {
          amountInput.value = Math.round(w * weighProduct.price);
          btnConfirm.disabled = false;
        } else {
          amountInput.value = '';
          btnConfirm.disabled = true;
        }
      });

      amountInput.addEventListener('input', function() {
        if (!weighProduct) return;
        var amt = parseInt(amountInput.value, 10);
        if (amt > 0) {
          weightInput.value = (amt / weighProduct.price).toFixed(3);
          btnConfirm.disabled = false;
        } else {
          weightInput.value = '';
          btnConfirm.disabled = true;
        }
      });
    }

    if(btnCancel) btnCancel.addEventListener('click', closeWeighModal);
    if(btnConfirm) {
      btnConfirm.addEventListener('click', function() {
        if (!weighProduct) return;
        var qty = parseFloat(weightInput.value);
        if (qty > 0) {
          weighProduct.is_weighed = true;
          Cart.add(weighProduct, qty);
          closeWeighModal();
        }
      });
    }
  }

  function openWeighModal(product) {
    weighProduct = product;
    document.getElementById('weigh-product-name').textContent = product.name;
    document.getElementById('weigh-product-price').textContent = formatCLP(product.price);
    document.getElementById('weigh-weight-input').value = '';
    document.getElementById('weigh-amount-input').value = '';
    document.getElementById('btn-weigh-confirm').disabled = true;
    
    var modal = document.getElementById('weigh-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }

  function closeWeighModal() {
    weighProduct = null;
    var modal = document.getElementById('weigh-modal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }

  // ----------------------------------------------------------
  // Barcode Scanner (Camera)
  // ----------------------------------------------------------
  var scannerStream = null;
  var scannerActive = false;
  var codeReader = null;
  var scannerLoadingToken = null;

  function initScanner() {
    var btnScan = document.getElementById('btn-scan');
    var btnClose = document.getElementById('btn-close-scanner');
    if (btnScan) btnScan.addEventListener('click', openScanner);
    if (btnClose) btnClose.addEventListener('click', closeScanner);
  }

  function openScanner() {
    var overlay = document.getElementById('scanner-overlay');
    var video = document.getElementById('scanner-video');
    var statusEl = document.getElementById('scanner-status');
    var btnScan = document.getElementById('btn-scan');
    if (!overlay || !video) return;

    overlay.classList.remove('hidden');
    statusEl.textContent = 'Iniciando cámara...';
    scannerActive = true;
    setButtonLoading(btnScan, true, { label: 'Abriendo cámara' });
    scannerLoadingToken = startActivity('Abriendo cámara', {
      message: 'Solicitando permiso y preparando el lector.',
      blocking: false,
      source: 'scanner',
    });

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    }).then(function (stream) {
      scannerStream = stream;
      video.srcObject = stream;
      video.play();
      statusEl.textContent = 'Apunte la cámara al código de barras';
      finishActivity(scannerLoadingToken);
      scannerLoadingToken = null;
      setButtonLoading(btnScan, false);
      startBarcodeDetection(video, statusEl);
    }).catch(function (err) {
      statusEl.textContent = 'No se pudo acceder a la cámara';
      finishActivity(scannerLoadingToken);
      scannerLoadingToken = null;
      setButtonLoading(btnScan, false);
      showToast('Error al acceder a la cámara: ' + err.message, 'error');
    });
  }

  function startBarcodeDetection(video, statusEl) {
    // Use BarcodeDetector API if available (Chrome/Edge), otherwise fallback to canvas polling
    if ('BarcodeDetector' in window) {
      var detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'code_128'] });
      var detectFrame = function () {
        if (!scannerActive) return;
        detector.detect(video).then(function (barcodes) {
          if (barcodes.length > 0) {
            handleBarcodeDetected(barcodes[0].rawValue);
            return;
          }
          requestAnimationFrame(detectFrame);
        }).catch(function () {
          requestAnimationFrame(detectFrame);
        });
      };
      detectFrame();
    } else {
      // Fallback: canvas-based polling with manual decode attempt
      statusEl.textContent = 'Escáner activo (ingrese código manualmente si no detecta)';
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      var pollFrame = function () {
        if (!scannerActive) return;
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0);
          // Without a full decoder library loaded, we rely on BarcodeDetector
          // If not available, the user can type the barcode manually
        }
        setTimeout(pollFrame, 500);
      };
      pollFrame();
    }
  }

  function handleBarcodeDetected(code) {
    closeScanner();
    lookupBarcode(code);
  }

  function lookupBarcode(code) {
    api.get('/products?barcode=' + encodeURIComponent(code), {
      label: 'Consultando producto escaneado',
    }).then(function (products) {
      if (products && products.length > 0) {
        var p = products[0];
        if (p.is_weighed) {
          openWeighModal({ id: p.id, name: p.name, price: p.price, stock: p.stock, is_weighed: true, tracks_stock: p.tracks_stock });
        } else {
          Cart.add({ id: p.id, name: p.name, price: p.price, stock: p.stock, is_weighed: false, tracks_stock: p.tracks_stock });
        }
      } else {
        showToast('Producto no encontrado: ' + code, 'warning');
      }
    }).catch(function () {
      showToast('Error al buscar producto', 'error');
    });
  }

  function closeScanner() {
    scannerActive = false;
    finishActivity(scannerLoadingToken);
    scannerLoadingToken = null;
    var overlay = document.getElementById('scanner-overlay');
    if (overlay) overlay.classList.add('hidden');
    setButtonLoading(document.getElementById('btn-scan'), false);
    if (scannerStream) {
      scannerStream.getTracks().forEach(function (track) { track.stop(); });
      scannerStream = null;
    }
    var video = document.getElementById('scanner-video');
    if (video) video.srcObject = null;
  }

  // ----------------------------------------------------------
  // Payment Processing
  // ----------------------------------------------------------
  var selectedPaymentMethod = 'efectivo';

  function initPayment() {
    // Payment method selector
    document.querySelectorAll('.payment-method-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.payment-method-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        selectedPaymentMethod = btn.dataset.method;

        var efectivoEl = document.getElementById('payment-efectivo');
        var tarjetaEl = document.getElementById('payment-tarjeta');
        if (selectedPaymentMethod === 'efectivo') {
          efectivoEl.classList.remove('hidden');
          tarjetaEl.classList.add('hidden');
        } else {
          efectivoEl.classList.add('hidden');
          tarjetaEl.classList.remove('hidden');
        }
        updatePaymentState();
      });
    });

    // Amount received input
    var amountInput = document.getElementById('amount-received');
    if (amountInput) {
      amountInput.addEventListener('input', function () {
        updatePaymentState();
      });
    }

    // Clear amount button
    var btnClearAmount = document.getElementById('btn-clear-amount');
    if (btnClearAmount) {
      btnClearAmount.addEventListener('click', function() {
        if (amountInput) {
          amountInput.value = '';
          updatePaymentState();
        }
      });
    }

    // Pay button
    var btnPay = document.getElementById('btn-pay');
    if (btnPay) {
      btnPay.addEventListener('click', function () {
        processSale();
      });
    }
  }

  function updatePaymentState() {
    var btnPay = document.getElementById('btn-pay');
    var changeDisplay = document.getElementById('change-display');
    var changeLabel = document.getElementById('change-label');
    var changeAmountEl = document.getElementById('change-amount');
    if (!btnPay) return;
    if (isButtonLoading(btnPay)) return;

    var total = Cart.getTotal();

    if (Cart.items.length === 0) {
      btnPay.disabled = true;
      if (changeDisplay) changeDisplay.classList.add('hidden');
      return;
    }

    if (selectedPaymentMethod === 'tarjeta') {
      btnPay.disabled = false;
      if (changeDisplay) changeDisplay.classList.add('hidden');
      return;
    }

    // Efectivo
    var amountInput = document.getElementById('amount-received');
    var received = parseInt(amountInput ? amountInput.value : '0', 10) || 0;

    btnPay.disabled = false;

    if (received <= 0) {
      if (changeDisplay) changeDisplay.classList.add('hidden');
      return;
    }

    if (changeDisplay) changeDisplay.classList.remove('hidden');

    if (received >= total) {
      var change = received - total;
      changeLabel.textContent = 'Vuelto:';
      changeAmountEl.textContent = formatCLP(change);
      changeDisplay.className = 'change-display positive';
    } else {
      var missing = total - received;
      changeLabel.textContent = 'Falta:';
      changeAmountEl.textContent = formatCLP(missing);
      changeDisplay.className = 'change-display negative';
    }
  }

  function processSale() {
    var btnPay = document.getElementById('btn-pay');
    if (isButtonLoading(btnPay)) return;
    setButtonLoading(btnPay, true, { label: 'Procesando...' });
    var processingMessage =
      selectedPaymentMethod === 'tarjeta'
        ? 'Registrando venta y actualizando stock...'
        : 'Registrando venta y emitiendo boleta...';

    var paymentActivity = startActivity('Procesando pago', {
      message: processingMessage,
      blocking: true,
    });

    var lines = Cart.items.map(function (item) {
      return { product_id: item.product_id, quantity: item.quantity };
    });

    var body = {
      client_sale_id: createClientSaleId(),
      lines: lines,
      payment_method: selectedPaymentMethod,
    };

    if (selectedPaymentMethod === 'efectivo') {
      var amountInput = document.getElementById('amount-received');
      var enteredAmount = parseInt(amountInput ? amountInput.value : '0', 10) || 0;
      var cartTotal = Cart.getTotal();

      if (enteredAmount > 0 && enteredAmount < cartTotal) {
        finishActivity(paymentActivity);
        setButtonLoading(btnPay, false);
        updatePaymentState();
        showToast('⚠️ Monto recibido insuficiente', 'warning');
        return;
      }

      body.amount_received = enteredAmount > 0 ? enteredAmount : cartTotal;
    }

    if (!navigator.onLine) {
      finishActivity(paymentActivity);
      queueOfflineSale(body, btnPay);
      return;
    }

    api.post('/sales', body, {
      label: 'Procesando pago',
      blocking: true,
    }).then(function (result) {
      Cart.clear();
      resetPaymentForm();

      if (result.receipt) {
        if (!handleSaleCompletion(result.receipt)) {
          showReceipt(result.receipt, { autoPrint: false });
        }
      } else {
        showToast('Venta registrada', 'success');
      }

      // Notify critical stock alerts
      if (result.critical_stock_alerts && result.critical_stock_alerts.length > 0) {
        notifyCriticalStock(result.critical_stock_alerts);
      }
    }).catch(function (err) {
      if (shouldQueueOfflineSale(err)) {
        queueOfflineSale(body, btnPay);
        return;
      }
      if (btnPay) btnPay.disabled = false;
      var msg = 'Error al procesar la venta';
      if (err.data && err.data.error === 'INSUFFICIENT_STOCK') {
        msg = '⚠️ Stock insuficiente para uno o más productos';
      } else if (err.data && err.data.error === 'INSUFFICIENT_PAYMENT') {
        msg = '⚠️ Monto recibido insuficiente';
      } else if (err.data && err.data.error === 'DUPLICATE_SALE') {
        msg = '⚠️ Esta venta ya fue registrada';
      } else if (err.message) {
        msg = '❌ ' + err.message;
      }
      showToast(msg, 'error');
    }).finally(function () {
      finishActivity(paymentActivity);
      setButtonLoading(btnPay, false);
      updatePaymentState();
    });
  }

  function shouldQueueOfflineSale(err) {
    return !navigator.onLine ||
      err?.status === 503 ||
      err?.data?.error === 'OFFLINE' ||
      err?.message === 'Failed to fetch' ||
      err?.message === 'NetworkError';
  }

  function queueOfflineSale(body, btnPay) {
    var activityId = startActivity('Guardando venta offline', {
      blocking: true,
      message: 'La venta quedara lista para sincronizarse apenas vuelva la conexion.',
    });
    OfflineDB.savePendingSale(body).then(function () {
      Cart.clear();
      resetPaymentForm();
      showToast('Sin conexión: venta encolada para sincronizar', 'warning');
    }).catch(function () {
      showToast('Error al guardar venta offline', 'error');
    }).finally(function () {
      finishActivity(activityId);
      setButtonLoading(btnPay, false);
      updatePaymentState();
    });
  }

  function createClientSaleId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return String(Date.now()) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function resetPaymentForm() {
    var amountInput = document.getElementById('amount-received');
    if (amountInput) amountInput.value = '';
    var changeDisplay = document.getElementById('change-display');
    if (changeDisplay) changeDisplay.classList.add('hidden');
    selectedPaymentMethod = 'efectivo';
    document.querySelectorAll('.payment-method-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.method === 'efectivo');
    });
    var efectivoEl = document.getElementById('payment-efectivo');
    var tarjetaEl = document.getElementById('payment-tarjeta');
    if (efectivoEl) efectivoEl.classList.remove('hidden');
    if (tarjetaEl) tarjetaEl.classList.add('hidden');
  }

  // ----------------------------------------------------------
  // Receipt Display
  // ----------------------------------------------------------
  function handleSaleCompletion(receipt) {
    if (!receipt) return false;

    if (receipt.payment_method === 'tarjeta') {
      showToast('Venta con tarjeta registrada', 'success');
      router.navigate('sale');
      return true;
    }

    if (shouldAutoPrintOfficialReceipt(receipt)) {
      showReceipt(receipt, { autoPrint: true, autoReturn: true });
      return true;
    }

    return false;
  }

  function shouldAutoPrintOfficialReceipt(receipt) {
    return !!(
      receipt &&
      receipt.printer_enabled &&
      receipt.boleta_folio &&
      receipt.boleta_status === 'emitida'
    );
  }

  function showReceipt(receipt, options) {
    options = options || {};

    var content = document.getElementById('receipt-content');
    if (!content) return;

    var items = Array.isArray(receipt.items) ? receipt.items : [];
    var emittedAt = receipt.boleta_emitted_at || receipt.date;
    var html = '';
    html += '<div class="receipt-brand">Monay Market</div>';
    html += '<div class="receipt-document-head">';
    html += '<div class="receipt-document-title">BOLETA ELECTRONICA</div>';
    if (receipt.boleta_folio) {
      html += '<div class="receipt-document-folio">NUMERO: ' + escapeHtml(receipt.boleta_folio) + '</div>';
    }
    html += '</div>';

    html += '<div class="receipt-store-name">' + escapeHtml(receipt.store_name) + '</div>';
    if (receipt.store_rut) {
      html += '<div class="receipt-store-line">R.U.T.: ' + escapeHtml(receipt.store_rut) + '</div>';
    }
    if (receipt.store_giro) {
      html += '<div class="receipt-store-line">GIRO: ' + escapeHtml(receipt.store_giro) + '</div>';
    }
    html += '<div class="receipt-document-city">S.I.I. - CHILE</div>';
    html += '<hr class="receipt-divider">';

    html += '<div class="receipt-meta-row"><span>EMISION</span><strong>' + formatReceiptDateTime(emittedAt) + '</strong></div>';

    html += '<div class="receipt-section-title">DETALLE</div>';

    html += '<div class="receipt-items">';
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var quantity = formatReceiptQuantity(item.quantity);
      html += '<div class="receipt-item-row">';
      html += '<span class="receipt-item-name">' + escapeHtml(item.name) + '</span>';
      html += '<span class="receipt-item-amount">' + formatCLP(item.subtotal) + '</span>';
      html += '</div>';
      html += '<div class="receipt-item-detail">' + quantity + ' x ' + formatCLP(item.unit_price) + '</div>';
    }
    html += '</div>';

    html += '<hr class="receipt-divider">';

    html += '<div class="receipt-total-row">';
    html += '<span>TOTAL</span>';
    html += '<span>' + formatCLP(receipt.total) + '</span>';
    html += '</div>';

    html += '<div class="receipt-tax-note">El IVA incluido en esta boleta es de:&nbsp;<strong>' + formatCLP(receipt.iva_included) + '</strong></div>';

    if (receipt.boleta_folio) {
      html += '<div class="receipt-timbre">';
      if (receipt.boleta_timbre) {
        html += '<canvas class="receipt-timbre-code" width="620" height="160" data-receipt-timbre="' + escapeAttr(receipt.boleta_timbre) + '" aria-label="Timbre electrónico SII"></canvas>';
      } else {
        html += '<div class="receipt-boleta-status error">Timbre electrónico no recibido desde API Gateway</div>';
      }
      html += '<div class="receipt-timbre-label">Timbre Electrónico SII</div>';
      html += '<div class="receipt-timbre-resolution">Res. 99 de 2014</div>';
      html += '<div class="receipt-timbre-summary">Verifique documento en sii.cl</div>';
      html += '</div>';
      if (receipt.boleta_pdf_url) {
        html += '<div class="receipt-pdf-link"><a href="' + escapeAttr(receipt.boleta_pdf_url) + '" target="_blank" rel="noopener noreferrer">Ver PDF oficial</a></div>';
      }
    } else {
      var boletaStatus = getReceiptBoletaStatus(receipt.boleta_status);
      if (boletaStatus) {
        html += '<div class="receipt-boleta-status ' + boletaStatus.type + '">' + boletaStatus.label + '</div>';
      }
    }

    content.innerHTML = html;
    renderReceiptTimbres(content);
    router.navigate('receipt');
    maybeAutoPrintReceipt(receipt, options);
  }

  function maybeAutoPrintReceipt(receipt, options) {
    if (!options || !options.autoPrint) return;
    if (!receipt || !receipt.printer_enabled) return;
    if (!receipt.sale_id || autoPrintState.lastSaleId === receipt.sale_id) return;
    if (receipt.boleta_status !== 'emitida') return;
    if (autoPrintState.inFlight) return;

    var printActivity = startActivity('Generando boleta oficial', {
      message: 'Preparando timbre SII e iniciando impresion...',
      blocking: true,
    });

    autoPrintState.inFlight = true;
    autoPrintState.lastSaleId = receipt.sale_id;

    waitForReceiptTimbres().then(function () {
      var printDelayMs = 80;
      window.setTimeout(function () {
        try {
          finishActivity(printActivity);
          window.print();
          if (options.autoReturn) {
            window.setTimeout(function () {
              router.navigate('sale');
            }, 450);
          }
        } catch (err) {
          autoPrintState.lastSaleId = null;
          finishActivity(printActivity);
          showToast('No se pudo iniciar la impresion automatica', 'error');
        } finally {
          autoPrintState.inFlight = false;
        }
      }, printDelayMs);
    }).catch(function () {
      finishActivity(printActivity);
      autoPrintState.inFlight = false;
      autoPrintState.lastSaleId = null;
      showToast('No se pudo preparar el timbre para impresion', 'error');
    });
  }

  function getReceiptBoletaStatus(status) {
    switch (status) {
      case 'pendiente':
        return { type: 'pending', label: 'Boleta pendiente de emisión SII' };
      case 'error':
        return { type: 'error', label: 'Error en emisión de boleta SII' };
      case 'no_aplica':
        return { type: 'muted', label: 'Boleta electrónica no configurada' };
      default:
        return null;
    }
  }

  function initReceipt() {
    var btnClose = document.getElementById('btn-close-receipt');
    if (btnClose) {
      btnClose.addEventListener('click', function () {
        router.navigate('sale');
      });
    }

    var btnPrint = document.getElementById('btn-print-receipt');
    if (btnPrint) {
      btnPrint.addEventListener('click', function () {
        var printActivity = startActivity('Generando Boleta', {
          message: 'Preparando timbre SII e iniciando impresion...',
          blocking: true,
        });
        waitForReceiptTimbres().then(function () {
          finishActivity(printActivity);
          window.print();
        }).catch(function () {
          finishActivity(printActivity);
          showToast('No se pudo preparar el timbre para impresion', 'error');
        });
      });
    }
  }

  function waitForReceiptTimbres() {
    var content = document.getElementById('receipt-content');
    if (!content) return Promise.resolve();
    var pending = Array.prototype.slice
      .call(content.querySelectorAll('canvas[data-receipt-timbre]'))
      .map(function (canvas) {
        return canvas.__receiptTimbrePromise || Promise.resolve();
      });
    return Promise.allSettled(pending);
  }

  // ----------------------------------------------------------
  // Sales History
  // ----------------------------------------------------------
  var historyState = {
    efectivo: [],
    tarjeta: [],
    pageEfectivo: 1,
    pageTarjeta: 1,
    perPage: 5
  };
  var historyLoadVersion = 0;

  function loadHistory() {
    var listEl = document.getElementById('history-list');
    var btnRefresh = document.getElementById('btn-refresh-history');
    if (!listEl) return;
    var currentLoadVersion = ++historyLoadVersion;
    listEl.innerHTML = '<p class="history-empty">Cargando ventas...</p>';
    setButtonLoading(btnRefresh, true);

    // Get today's sales
    var now = new Date();
    var y = now.getFullYear();
    var dateFrom = new Date(y, now.getMonth(), now.getDate(), 0, 0, 0, 0).toISOString();
    var dateTo = new Date(y, now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

    api.get('/sales?date_from=' + encodeURIComponent(dateFrom) + '&date_to=' + encodeURIComponent(dateTo), {
      label: 'Actualizando historial',
    })
      .then(function (sales) {
        if (currentLoadVersion !== historyLoadVersion) return;
        if (!sales) sales = [];
        historyState.efectivo = sales.filter(function(s) { return s.payment_method === 'efectivo'; });
        historyState.tarjeta = sales.filter(function(s) { return s.payment_method === 'tarjeta'; });
        historyState.pageEfectivo = 1;
        historyState.pageTarjeta = 1;
        renderHistoryView();
      })
      .catch(function () {
        if (currentLoadVersion !== historyLoadVersion) return;
        listEl.innerHTML = '<p class="history-empty">Error al cargar ventas</p>';
      })
      .finally(function () {
        if (currentLoadVersion === historyLoadVersion) {
          setButtonLoading(btnRefresh, false);
        }
      });
  }

  function renderHistoryView() {
    var listEl = document.getElementById('history-list');
    if (!listEl) return;

    var totalEfe = historyState.efectivo.reduce(function(sum, s) { return sum + s.total; }, 0);
    var totalTar = historyState.tarjeta.reduce(function(sum, s) { return sum + s.total; }, 0);
    var granTotal = totalEfe + totalTar;

    var html = '<div class="history-dashboard">';

    html += '<div class="history-summary-grid" aria-label="Resumen de ventas del día">';
    html += '<article class="history-summary-card history-summary-card-cash"><span class="history-summary-label">Efectivo</span><strong class="history-summary-amount">' + formatCLP(totalEfe) + '</strong></article>';
    html += '<article class="history-summary-card history-summary-card-card"><span class="history-summary-label">Tarjeta</span><strong class="history-summary-amount">' + formatCLP(totalTar) + '</strong></article>';
    html += '<article class="history-summary-card history-summary-card-total"><span class="history-summary-label">Total</span><strong class="history-summary-amount">' + formatCLP(granTotal) + '</strong></article>';
    html += '</div>';

    html += '<div class="history-columns">';
    
    html += '<section class="history-column">';
    html += '<h3 class="history-section-title">Ventas en Efectivo</h3>';
    html += renderHistoryTable(historyState.efectivo, historyState.pageEfectivo, 'efectivo');
    html += '</section>';

    html += '<section class="history-column">';
    html += '<h3 class="history-section-title">Ventas con Tarjeta</h3>';
    html += renderHistoryTable(historyState.tarjeta, historyState.pageTarjeta, 'tarjeta');
    html += '</section>';

    html += '</div></div>';

    listEl.innerHTML = html;
  }

  function renderHistoryTable(salesArray, page, method) {
    if (salesArray.length === 0) {
      var emptyStyle = 'background: var(--color-surface); border-radius: 10px; box-shadow: 0 4px 6px -1px rgba(23,32,22,0.08); border: 1px solid var(--color-border); padding: 24px; text-align: center; color: var(--color-text-secondary);';
      return '<div style="' + emptyStyle + '">No hay ventas registradas.</div>';
    }

    var totalPages = Math.ceil(salesArray.length / historyState.perPage);
    if (totalPages === 0) totalPages = 1;
    if (page > totalPages) page = totalPages;

    var start = (page - 1) * historyState.perPage;
    var end = start + historyState.perPage;
    var paginatedSales = salesArray.slice(start, end);

    var tableCardStyle = 'background: var(--color-surface); border-radius: 10px; box-shadow: 0 4px 6px -1px rgba(23,32,22,0.08); border: 1px solid var(--color-border); overflow: hidden;';
    var html = '<div style="' + tableCardStyle + '"><div style="overflow-x: auto; padding: 0;">';
    html += '<table class="data-table" style="margin: 0; width: 100%; white-space: nowrap; border-collapse: collapse;">';
    html += '<thead style="background-color: var(--color-bg); border-bottom: 1px solid var(--color-border);"><tr><th style="text-align: left; padding: 12px 16px; color: var(--color-text-secondary); font-weight: 600;">Hora</th><th style="text-align: left; padding: 12px 16px; color: var(--color-text-secondary); font-weight: 600;">Total</th><th style="text-align: left; padding: 12px 16px; color: var(--color-text-secondary); font-weight: 600;">Estado Boleta</th><th style="text-align: left; padding: 12px 16px; color: var(--color-text-secondary); font-weight: 600;">Acción</th></tr></thead>';
    html += '<tbody>';

    for (var i = 0; i < paginatedSales.length; i++) {
      var sale = paginatedSales[i];
      var boletaLabel = boletaStatusLabel(sale.boleta_status);
      var badgeType = 'neutral';
      if (sale.boleta_status === 'emitida') badgeType = 'success';
      if (sale.boleta_status === 'pendiente') badgeType = 'warning';
      if (sale.boleta_status === 'error') badgeType = 'error';

      html += '<tr style="border-bottom: 1px solid var(--color-border);">';
      html += '<td style="padding: 12px 16px;">' + formatTime(sale.created_at) + '</td>';
      html += '<td style="padding: 12px 16px;">' + formatCLP(sale.total) + '</td>';
      html += '<td style="padding: 12px 16px;"><span class="badge badge-' + badgeType + '">' + boletaLabel + '</span></td>';
      html += '<td style="padding: 12px 16px;"><button class="btn btn-sm btn-primary" data-action="view-receipt" data-sale-id="' + sale.id + '">Ver</button></td>';
      html += '</tr>';
    }
    html += '</tbody></table>';

    // Paginador
    if (totalPages > 1) {
      html += '<div style="display: flex; justify-content: space-between; align-items: center; padding: 16px; border-top: 1px solid var(--color-border);">';
      html += '<span style="color: var(--color-text-muted); font-size: 0.9rem;">Página ' + page + ' de ' + totalPages + '</span>';
      html += '<div style="display: flex; gap: 8px;">';

      var prevDisabled = page <= 1 ? 'pointer-events: none; opacity: 0.5;' : '';
      html += '<button class="btn btn-sm btn-secondary" style="' + prevDisabled + '" data-action="paginate" data-method="' + method + '" data-page="' + (page - 1) + '">Anterior</button>';

      var nextDisabled = page >= totalPages ? 'pointer-events: none; opacity: 0.5;' : '';
      html += '<button class="btn btn-sm btn-secondary" style="' + nextDisabled + '" data-action="paginate" data-method="' + method + '" data-page="' + (page + 1) + '">Siguiente</button>';

      html += '</div></div>';
    }

    html += '</div></div>';
    return html;
  }

  function boletaStatusLabel(status) {
    switch (status) {
      case 'emitida': return 'Boleta emitida';
      case 'pendiente': return 'Pendiente';
      case 'error': return 'Error boleta';
      case 'no_aplica': return 'Sin boleta';
      default: return 'Sin boleta';
    }
  }

  // ----------------------------------------------------------
  // Bulk Product Quick Create
  // ----------------------------------------------------------
  function resetBulkProductForm() {
    var form = document.getElementById('bulk-product-form');
    var useCritical = document.getElementById('bulk-product-use-critical');
    var criticalGroup = document.getElementById('bulk-product-critical-group');
    var criticalInput = document.getElementById('bulk-product-critical');
    if (form) form.reset();
    if (useCritical) useCritical.checked = false;
    if (criticalGroup) criticalGroup.classList.add('hidden');
    if (criticalInput) criticalInput.value = '';
  }

  function openBulkProductModal() {
    var modal = document.getElementById('bulk-product-modal');
    var nameInput = document.getElementById('bulk-product-name');
    if (!modal) return;
    resetBulkProductForm();
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    if (nameInput) {
      setTimeout(function () { nameInput.focus(); }, 40);
    }
  }

  function closeBulkProductModal() {
    var modal = document.getElementById('bulk-product-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.style.display = '';
  }

  function parseBulkDecimal(input) {
    if (!input) return 0;
    return Number(String(input.value || '').replace(',', '.'));
  }

  function initBulkProductModal() {
    var openBtn = document.getElementById('btn-open-bulk-product');
    var closeBtn = document.getElementById('btn-close-bulk-product');
    var cancelBtn = document.getElementById('btn-cancel-bulk-product');
    var form = document.getElementById('bulk-product-form');
    var useCritical = document.getElementById('bulk-product-use-critical');
    var criticalGroup = document.getElementById('bulk-product-critical-group');
    var saveBtn = document.getElementById('btn-save-bulk-product');

    if (openBtn) openBtn.addEventListener('click', openBulkProductModal);
    if (closeBtn) closeBtn.addEventListener('click', closeBulkProductModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeBulkProductModal);

    if (useCritical) {
      useCritical.addEventListener('change', function () {
        if (criticalGroup) {
          criticalGroup.classList.toggle('hidden', !useCritical.checked);
        }
      });
    }

    if (!form) return;

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      var nameInput = document.getElementById('bulk-product-name');
      var priceInput = document.getElementById('bulk-product-price');
      var stockInput = document.getElementById('bulk-product-stock');
      var criticalInput = document.getElementById('bulk-product-critical');
      var name = nameInput ? nameInput.value.trim() : '';
      var price = priceInput ? parseInt(priceInput.value, 10) : 0;
      var stock = parseBulkDecimal(stockInput);
      var criticalStock = useCritical && useCritical.checked ? parseBulkDecimal(criticalInput) : 0;

      if (!name) {
        showToast('Ingresa el nombre del producto a granel.', 'warning');
        if (nameInput) nameInput.focus();
        return;
      }
      if (!price || price <= 0) {
        showToast('Ingresa el precio por kilo.', 'warning');
        if (priceInput) priceInput.focus();
        return;
      }
      if (Number.isNaN(stock) || stock < 0) {
        showToast('Ingresa el stock inicial en kilos.', 'warning');
        if (stockInput) stockInput.focus();
        return;
      }
      if (Number.isNaN(criticalStock) || criticalStock < 0) {
        showToast('Ingresa un stock crítico válido.', 'warning');
        if (criticalInput) criticalInput.focus();
        return;
      }

      setButtonLoading(saveBtn, true, { label: 'Creando...' });
      api.post('/products/granel', {
        name: name,
        price: price,
        stock: stock,
        critical_stock: criticalStock,
      }, {
        label: 'Creando producto a granel',
        blocking: true,
      }).then(function () {
        showToast('Producto a granel creado correctamente.', 'success');
        closeBulkProductModal();
      }).catch(function (err) {
        var message = (err && err.data && err.data.message) || err.message || 'No se pudo crear el producto a granel.';
        showToast(message, 'error');
      }).finally(function () {
        setButtonLoading(saveBtn, false);
      });
    });
  }

  function initHistory() {
    var listEl = document.getElementById('history-list');
    var btnRefresh = document.getElementById('btn-refresh-history');

    if (btnRefresh) {
      btnRefresh.addEventListener('click', function () {
        loadHistory();
      });
    }

    if (listEl) {
      listEl.addEventListener('click', function (e) {
        var btnView = e.target.closest('[data-action="view-receipt"]');
        if (btnView && btnView.dataset.saleId) {
          viewSaleReceipt(btnView.dataset.saleId, btnView);
          return;
        }

        var btnPaginate = e.target.closest('[data-action="paginate"]');
        if (btnPaginate) {
          var method = btnPaginate.dataset.method;
          var page = parseInt(btnPaginate.dataset.page, 10);
          if (method === 'efectivo') historyState.pageEfectivo = page;
          if (method === 'tarjeta') historyState.pageTarjeta = page;
          renderHistoryView();
        }
      });
    }
  }

  function viewSaleReceipt(saleId, triggerBtn) {
    setButtonLoading(triggerBtn, true);
    api.get('/sales/' + saleId + '/receipt', {
      label: 'Cargando comprobante',
    }).then(function (receipt) {
      showReceipt(receipt);
    }).catch(function () {
      showToast('Error al cargar comprobante', 'error');
    }).finally(function () {
      setButtonLoading(triggerBtn, false);
    });
  }

  // ----------------------------------------------------------
  // Arqueo de Caja Visual
  // ----------------------------------------------------------
  var expectedArqueoCash = 0;
  var lastCountedCash = 0;

function initArqueo() {
    var btnArqueo = document.getElementById('btn-arqueo');
    if (btnArqueo) {
      btnArqueo.addEventListener('click', function() {
        router.navigate('arqueo');
        loadArqueoData();
      });
    }

    // Botones + y - para arqueo
    document.querySelectorAll('.arqueo-btn-plus').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var val = parseInt(btn.dataset.val, 10);
        var input = document.querySelector('.arqueo-input[data-val="' + val + '"]');
        if (input) {
          var current = parseInt(input.value, 10) || 0;
          input.value = current + 1;
          calculateArqueo();
        }
      });
    });

    document.querySelectorAll('.arqueo-btn-minus').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var val = parseInt(btn.dataset.val, 10);
        var input = document.querySelector('.arqueo-input[data-val="' + val + '"]');
        if (input) {
          var current = parseInt(input.value, 10) || 0;
          if (current > 0) {
            input.value = current - 1;
            calculateArqueo();
          }
        }
      });
    });

    document.querySelectorAll('.arqueo-input').forEach(function(input) {
      input.addEventListener('input', calculateArqueo);
    });

    var btnSubmit = document.getElementById('btn-submit-arqueo');
    if (btnSubmit) {
      btnSubmit.addEventListener('click', function() {
        if (isButtonLoading(btnSubmit)) return;
        showConfirm('¿Está seguro de cerrar el turno? Esto registrará la cuadratura.').then(function(confirmed) {
          if(confirmed) {
            setButtonLoading(btnSubmit, true, { label: 'Cerrando turno' });
            api.post('/sales/close-register', { counted_efectivo: lastCountedCash }, {
              label: 'Cerrando caja',
              blocking: true,
            }).then(function() {
               showToast('Caja cuadrada y turno cerrado con éxito', 'success');
               router.navigate('history');
            }).catch(function(err) {
               showToast('Error al guardar cuadratura: ' + (err.message || 'Error del servidor'), 'error');
            }).finally(function () {
               setButtonLoading(btnSubmit, false);
            });
          }
        });
      });
    }
  }

  function loadArqueoData() {
    document.querySelectorAll('.arqueo-input').forEach(function(input) { input.value = ''; });
    expectedArqueoCash = historyState.efectivo.reduce(function(sum, s) { return sum + s.total; }, 0);
    document.getElementById('arqueo-expected').textContent = formatCLP(expectedArqueoCash);
    calculateArqueo();
  }

  function calculateArqueo() {
    var totalCounted = 0;
    document.querySelectorAll('.arqueo-input').forEach(function(input) {
      var qty = parseInt(input.value, 10) || 0;
      var val = parseInt(input.dataset.val, 10) || 0;
      if(qty > 0) totalCounted += (qty * val);
    });

    lastCountedCash = totalCounted;
    document.getElementById('arqueo-counted').textContent = formatCLP(totalCounted);
    
    var diff = totalCounted - expectedArqueoCash;
    var diffEl = document.getElementById('arqueo-diff');
    var statusEl = document.getElementById('arqueo-status-msg');

    diffEl.textContent = formatCLP(diff);

    if (diff === 0) {
      diffEl.style.color = '#16a34a';
      statusEl.textContent = '¡Caja cuadrada perfectamente! ✅';
      statusEl.style.color = '#16a34a';
    } else if (diff > 0) {
      diffEl.style.color = '#8a6a12';
      statusEl.textContent = 'Sobra dinero en caja 🧐';
      statusEl.style.color = '#8a6a12';
    } else {
      diffEl.style.color = '#dc2626';
      statusEl.textContent = 'Falta dinero en caja ⚠️';
      statusEl.style.color = '#dc2626';
    }
  }

  // ----------------------------------------------------------
  // Cart Event Delegation
  // ----------------------------------------------------------
  function initCartEvents() {
    var cartContainer = document.getElementById('cart-items');
    if (!cartContainer) return;

    cartContainer.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.dataset.action;
      var id = btn.dataset.id;
      if (action === 'inc') Cart.updateQty(id, 1);
      else if (action === 'dec') Cart.updateQty(id, -1);
      else if (action === 'remove') Cart.remove(id);
    });

    var btnClear = document.getElementById('btn-clear-cart');
    if (btnClear) {
      btnClear.addEventListener('click', function () {
        if (Cart.items.length === 0) return;
        showConfirm('¿Vaciar el carrito?').then(function (confirmed) {
          if (confirmed) Cart.clear();
        });
      });
    }
  }

  // ----------------------------------------------------------
  // Auth — login / logout
  // ----------------------------------------------------------
  function decodeTokenPayload(token) {
    try {
      var payload = token.split('.')[1];
      var normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      var decoded = atob(normalized);
      return JSON.parse(decoded);
    } catch (err) {
      return null;
    }
  }

  function getTokenRole(token) {
    var payload = decodeTokenPayload(token);
    return payload && payload.role;
  }

  function isPosRole(role) {
    return role === 'cajero' || role === 'vendedor';
  }

  function isCashierSession() {
    var token = api.getToken();
    return token && isPosRole(getTokenRole(token));
  }

  function readCookie(name) {
    var prefix = name + '=';
    var parts = document.cookie ? document.cookie.split('; ') : [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].indexOf(prefix) === 0) {
        return decodeURIComponent(parts[i].slice(prefix.length));
      }
    }
    return '';
  }

  function clearCookie(name) {
    document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax';
    document.cookie = name + '=; Max-Age=0; path=/; SameSite=Lax; Secure';
  }

  function normalizeLoginUrl(value) {
    if (!value) return '';
    try {
      var url = new URL(value, window.location.origin);
      var isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
      if (isLocalhost && (url.port === '3000' || url.port === '5000')) {
        return '';
      }
      if (url.origin === window.location.origin) {
        return url.pathname + url.search + url.hash;
      }
      return url.href;
    } catch (err) {
      return '';
    }
  }

  function getCentralLoginUrl() {
    var storedUrl = normalizeLoginUrl(sessionStorage.getItem('monay_login_url'));
    if (storedUrl) return storedUrl;

    sessionStorage.removeItem('monay_login_url');
    return normalizeLoginUrl(CONFIG.LOGIN_URL) || '/login';
  }

  function redirectToCentralLogin() {
    if (authRedirectInFlight) return;
    authRedirectInFlight = true;
    startActivity('Abriendo acceso del POS', {
      blocking: true,
      message: 'Redirigiendo al inicio de sesion central.',
    });
    window.location.replace(getCentralLoginUrl());
  }

  function clearPosClientState() {
    api.clearToken();
    Cart.clear();
    sessionStorage.removeItem('monay_login_url');
    clearCookie('monay_pos_token');
    clearCookie('monay_pos_user');
    clearCookie('monay_login_url');

    var cacheClearPromise = Promise.resolve();
    if ('caches' in window && typeof window.caches.keys === 'function') {
      cacheClearPromise = window.caches.keys().then(function (keys) {
        return Promise.all(
          keys
            .filter(function (key) {
              return key.indexOf('monay-pos-') === 0;
            })
            .map(function (key) {
              return window.caches.delete(key);
            })
        );
      }).catch(function () {
        return [];
      });
    }

    var unregisterPromise = Promise.resolve();
    if ('serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistrations === 'function') {
      unregisterPromise = navigator.serviceWorker.getRegistrations().then(function (registrations) {
        return Promise.all(
          registrations
            .filter(function (registration) {
              return registration.scope.indexOf('/pos/') !== -1;
            })
            .map(function (registration) {
              return registration.unregister();
            })
        );
      }).catch(function () {
        return [];
      });
    }

    return Promise.all([cacheClearPromise, unregisterPromise]);
  }

  function importRedirectSession() {
    var token = readCookie('monay_pos_token');
    if (!token) return;

    var role = getTokenRole(token);
    if (!isPosRole(role)) {
      clearCookie('monay_pos_token');
      clearCookie('monay_pos_user');
      return;
    }

    api.setToken(token);

    var rawUser = readCookie('monay_pos_user');
    if (rawUser) {
      try {
        api.setUser(JSON.parse(rawUser));
      } catch (err) {
        api.setUser({ role: role });
      }
    }

    var loginUrl = readCookie('monay_login_url');
    var normalizedLoginUrl = normalizeLoginUrl(loginUrl);
    if (normalizedLoginUrl) {
      sessionStorage.setItem('monay_login_url', normalizedLoginUrl);
    } else {
      sessionStorage.removeItem('monay_login_url');
    }

    clearCookie('monay_pos_token');
    clearCookie('monay_pos_user');
    clearCookie('monay_login_url');
  }

  function initLogout() {
    var btn = document.getElementById('btn-logout');
    if (btn) {
      btn.addEventListener('click', function () {
        if (authRedirectInFlight) return;
        clearPosClientState().finally(function () {
          redirectToCentralLogin();
        });
      });
    }
  }

  // ----------------------------------------------------------
  // Navigation
  // ----------------------------------------------------------
  function initNav() {
    document.querySelectorAll('.nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var screen = btn.dataset.screen;
        if (screen) {
          router.navigate(screen);
        }
      });
    });
  }

  // ----------------------------------------------------------
  // Service Worker Registration
  // ----------------------------------------------------------
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      var scope = window.location.pathname.startsWith('/pos') ? '/pos/' : '/';
      navigator.serviceWorker
        .register(scope + 'service-worker.js', { scope: scope })
        .catch(function (err) {
          console.warn('SW registration failed:', err);
        });
    }
  }

  // ----------------------------------------------------------
  // Offline Sync
  // ----------------------------------------------------------
  async function syncOfflineSales() {
    var activityId = null;
    try {
      const pending = await OfflineDB.getPendingSales();
      if (pending && pending.length > 0) {
        activityId = startActivity('Sincronizando ventas pendientes', {
          message: pending.length + ' ventas offline en proceso de reintento.',
        });
        showToast('Sincronizando ' + pending.length + ' ventas offline...', 'success');
        let synced = 0;
        let failed = 0;
        for (let i = 0; i < pending.length; i++) {
          const sale = pending[i];
          try {
            await api.post('/sales', sale.payload, {
              label: 'Reintentando ventas pendientes',
            });
            await OfflineDB.deletePendingSale(sale.id);
            synced += 1;
          } catch (err) {
            failed += 1;
            console.error('Error sincronizando venta:', err);
          }
        }
        if (failed > 0) {
          showToast('Sincronizadas: ' + synced + '. Pendientes: ' + failed, 'warning');
        } else {
          showToast('Ventas offline sincronizadas', 'success');
        }
        if (router.currentScreen === 'history') {
          loadHistory();
        }
      }
    } catch (err) {
      console.error('Error al obtener ventas pendientes:', err);
    } finally {
      finishActivity(activityId);
    }
  }

  window.addEventListener('online', syncOfflineSales);

  window.addEventListener('pageshow', function () {
    if (!isCashierSession()) {
      clearPosClientState().finally(function () {
        redirectToCentralLogin();
      });
    }
  });

  // ----------------------------------------------------------
  // App Init
  // ----------------------------------------------------------
  function init() {
    var startupActivity = startActivity('Validando acceso al POS', {
      blocking: true,
      message: 'Preparando la sesion del cajero.',
    });
    registerServiceWorker();
    importRedirectSession();
    Cart.init(updateCartUI, showToast);
    initLogout();
    initNav();
    initSearch();
    initScanner();
    initWeighModal();
    initCartEvents();
    initPayment();
    initReceipt();
    initBulkProductModal();
    initHistory();
    initArqueo();

    // Global auth expiration listener
    window.addEventListener('monay-auth-expired', function () {
      redirectToCentralLogin();
    });

    // Sync if online
    if (navigator.onLine) {
      syncOfflineSales();
    }

    waitForBwipJs(4000).catch(function () {
      // The receipt flow retries if the script is not ready yet.
    });

    // If we have a token, go to sale screen; otherwise login
    if (isCashierSession()) {
      router.navigate('sale');
      finishActivity(startupActivity);
      releaseBootState();
    } else {
      api.clearToken();
      redirectToCentralLogin();
    }
  }

  // Expose api and router for future modules
  window.MonayPOS = {
    api: api,
    router: router,
    CONFIG: CONFIG,
    loading: {
      start: startActivity,
      finish: finishActivity,
    },
  };

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
