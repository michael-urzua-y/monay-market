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
  function formatCLP(amount) {
    if (amount == null) return '$0';
    const abs = Math.abs(amount);
    const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (amount < 0 ? '-$' : '$') + formatted;
  }

  function formatTime(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' + formatTime(dateStr);
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
        var productData = JSON.stringify({ id: p.id, name: p.name, price: p.price, stock: p.stock, is_weighed: p.is_weighed }).replace(/"/g, '&quot;');
        html +=
          '<div class="search-result-item" data-product="' + productData + '">' +
          '<div>' +
          '<div class="search-result-name">' + escapeHtml(p.name) + '</div>' +
          '<div class="search-result-stock">Stock: ' + p.stock + '</div>' +
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
          openWeighModal({ id: p.id, name: p.name, price: p.price, stock: p.stock, is_weighed: true });
        } else {
          Cart.add({ id: p.id, name: p.name, price: p.price, stock: p.stock, is_weighed: false });
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

    // Quick amount buttons
    var quickAmountBtns = document.querySelectorAll('.quick-amount-btn');
    quickAmountBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var amount = parseInt(btn.dataset.amount, 10);
        if (amountInput) {
          amountInput.value = amount;
          updatePaymentState();
        }
      });
    });

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

    if (received <= 0) {
      btnPay.disabled = true;
      if (changeDisplay) changeDisplay.classList.add('hidden');
      return;
    }

    if (changeDisplay) changeDisplay.classList.remove('hidden');

    if (received >= total) {
      var change = received - total;
      changeLabel.textContent = 'Vuelto:';
      changeAmountEl.textContent = formatCLP(change);
      changeDisplay.className = 'change-display positive';
      btnPay.disabled = false;
    } else {
      var missing = total - received;
      changeLabel.textContent = 'Falta:';
      changeAmountEl.textContent = formatCLP(missing);
      changeDisplay.className = 'change-display negative';
      btnPay.disabled = true;
    }
  }

  function processSale() {
    var btnPay = document.getElementById('btn-pay');
    if (isButtonLoading(btnPay)) return;
    setButtonLoading(btnPay, true, { label: 'Procesando venta' });

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
      body.amount_received = parseInt(amountInput ? amountInput.value : '0', 10) || 0;
    }

    if (!navigator.onLine) {
      queueOfflineSale(body, btnPay);
      return;
    }

    api.post('/sales', body, {
      label: 'Procesando venta',
      blocking: true,
    }).then(function (result) {
      // result: { sale, critical_stock_alerts, receipt }
      Cart.clear();
      resetPaymentForm();

      if (result.receipt) {
        showReceipt(result.receipt);
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
        msg = 'Stock insuficiente para uno o más productos';
      } else if (err.data && err.data.error === 'INSUFFICIENT_PAYMENT') {
        msg = 'Monto recibido insuficiente';
      } else if (err.message) {
        msg = err.message;
      }
      showToast(msg, 'error');
    }).finally(function () {
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
  function showReceipt(receipt) {
    // receipt: { store_name, date, items, total, payment_method, amount_received, change_amount, boleta_status, boleta_folio }
    var content = document.getElementById('receipt-content');
    if (!content) return;

    var html = '';
    html += '<div class="receipt-store-name">' + escapeHtml(receipt.store_name) + '</div>';
    if (receipt.store_rut) {
      html += '<div class="receipt-store-rut">RUT ' + escapeHtml(receipt.store_rut) + '</div>';
    }
    html += '<div class="receipt-date">' + formatDate(receipt.date) + '</div>';
    html += '<hr class="receipt-divider">';

    // Items
    html += '<div class="receipt-items">';
    for (var i = 0; i < receipt.items.length; i++) {
      var item = receipt.items[i];
      html += '<div class="receipt-item">';
      html += '<span>' + escapeHtml(item.name) + '</span>';
      html += '<span>' + formatCLP(item.subtotal) + '</span>';
      html += '</div>';
      html += '<div class="receipt-item-detail">' + item.quantity + ' x ' + formatCLP(item.unit_price) + '</div>';
    }
    html += '</div>';

    html += '<hr class="receipt-divider">';

    // Total
    html += '<div class="receipt-total-row">';
    html += '<span>TOTAL</span>';
    html += '<span>' + formatCLP(receipt.total) + '</span>';
    html += '</div>';

    // Payment info
    var methodLabel = receipt.payment_method === 'efectivo' ? 'Efectivo' : 'Tarjeta';
    html += '<div class="receipt-payment-info">Método: ' + methodLabel + '</div>';

    if (receipt.payment_method === 'efectivo' && receipt.amount_received != null) {
      html += '<div class="receipt-payment-info">Recibido: ' + formatCLP(receipt.amount_received) + '</div>';
      html += '<div class="receipt-payment-info">Vuelto: ' + formatCLP(receipt.change_amount) + '</div>';
    }

    // Boleta
    if (receipt.boleta_folio) {
      html += '<div class="receipt-boleta">Boleta N° ' + escapeHtml(receipt.boleta_folio) + '</div>';
      if (receipt.boleta_timbre) {
        html += '<div class="receipt-timbre">';
        html += '<div class="receipt-timbre-label">Timbre Electrónico SII</div>';
        html += '<div class="receipt-timbre-code">' + escapeHtml(receipt.boleta_timbre) + '</div>';
        html += '</div>';
      }
      if (receipt.boleta_pdf_url) {
        html += '<div class="receipt-pdf-link"><a href="' + escapeHtml(receipt.boleta_pdf_url) + '" target="_blank">Ver PDF oficial</a></div>';
      }
    } else {
      var boletaStatus = getReceiptBoletaStatus(receipt.boleta_status);
      if (boletaStatus) {
        html += '<div class="receipt-boleta-status ' + boletaStatus.type + '">' + boletaStatus.label + '</div>';
      }
    }

    html += '<hr class="receipt-divider">';
    html += '<div class="receipt-footer">¡Gracias por su compra!</div>';

    content.innerHTML = html;
    router.navigate('receipt');
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
        window.print();
      });
    }
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
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var d = String(now.getDate()).padStart(2, '0');
    var todayStr = y + '-' + m + '-' + d;

    var dateFrom = todayStr;
    var dateTo = todayStr + 'T23:59:59Z';

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
    startActivity('Abriendo acceso del POS', {
      blocking: true,
      message: 'Redirigiendo al inicio de sesion central.',
    });
    window.location.assign(getCentralLoginUrl());
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
        api.clearToken();
        Cart.clear();
        redirectToCentralLogin();
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
