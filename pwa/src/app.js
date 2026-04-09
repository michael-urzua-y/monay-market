// ============================================================
// Monay Market POS — Main Application
// Vanilla JS PWA with screen routing and API client
// ============================================================

import { api, CONFIG } from './api.js';
import { OfflineDB } from './offline.js';

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
    screens: ['login', 'sale', 'history', 'receipt'],
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
        if (screenId === 'login') {
          header.classList.add('hidden');
        } else {
          header.classList.remove('hidden');
        }
      }
      document.querySelectorAll('.nav-btn').forEach(function (btn) {
        btn.classList.toggle('active', btn.dataset.screen === screenId);
      });
      this.currentScreen = screenId;

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
  // Each item: { product_id, product_name, unit_price, quantity, subtotal, available_stock }
  var cart = [];

  function getCartTotal() {
    var total = 0;
    for (var i = 0; i < cart.length; i++) {
      total += cart[i].subtotal;
    }
    return total;
  }

  function addToCart(product) {
    // product: { id, name, price, stock }
    var existing = null;
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].product_id === product.id) {
        existing = cart[i];
        break;
      }
    }
    if (existing) {
      var newQty = existing.quantity + 1;
      if (newQty > existing.available_stock) {
        showToast('Stock insuficiente. Disponible: ' + existing.available_stock, 'warning');
        return;
      }
      existing.quantity = newQty;
      existing.subtotal = existing.unit_price * newQty;
    } else {
      if (product.stock < 1) {
        showToast('Producto sin stock disponible', 'warning');
        return;
      }
      cart.push({
        product_id: product.id,
        product_name: product.name,
        unit_price: product.price,
        quantity: 1,
        subtotal: product.price,
        available_stock: product.stock,
      });
    }
    updateCartUI();
    showToast(product.name + ' agregado', 'success');
  }

  function updateItemQty(productId, delta) {
    for (var i = 0; i < cart.length; i++) {
      if (cart[i].product_id === productId) {
        var newQty = cart[i].quantity + delta;
        if (newQty < 1) {
          removeFromCart(productId);
          return;
        }
        if (newQty > cart[i].available_stock) {
          showToast('Stock insuficiente. Disponible: ' + cart[i].available_stock, 'warning');
          return;
        }
        cart[i].quantity = newQty;
        cart[i].subtotal = cart[i].unit_price * newQty;
        break;
      }
    }
    updateCartUI();
  }

  function removeFromCart(productId) {
    cart = cart.filter(function (item) { return item.product_id !== productId; });
    updateCartUI();
  }

  function clearCart() {
    cart = [];
    updateCartUI();
  }

  function updateCartUI() {
    var container = document.getElementById('cart-items');
    var totalEl = document.getElementById('cart-total');
    if (!container || !totalEl) return;

    if (cart.length === 0) {
      container.innerHTML = '<p class="cart-empty">El carrito está vacío</p>';
      totalEl.textContent = '$0';
      updatePaymentState();
      return;
    }

    var html = '';
    for (var i = 0; i < cart.length; i++) {
      var item = cart[i];
      html +=
        '<div class="cart-item" data-product-id="' + item.product_id + '">' +
        '<div class="cart-item-info">' +
        '<div class="cart-item-name">' + escapeHtml(item.product_name) + '</div>' +
        '<div class="cart-item-price">' + formatCLP(item.unit_price) + ' c/u</div>' +
        '</div>' +
        '<div class="cart-item-qty">' +
        '<button class="qty-btn" data-action="dec" data-id="' + item.product_id + '">−</button>' +
        '<span class="qty-value">' + item.quantity + '</span>' +
        '<button class="qty-btn" data-action="inc" data-id="' + item.product_id + '">+</button>' +
        '</div>' +
        '<div class="cart-item-subtotal">' + formatCLP(item.subtotal) + '</div>' +
        '<button class="cart-item-remove" data-action="remove" data-id="' + item.product_id + '">✕</button>' +
        '</div>';
    }
    container.innerHTML = html;
    totalEl.textContent = formatCLP(getCartTotal());
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

  function initSearch() {
    var input = document.getElementById('product-search');
    var resultsEl = document.getElementById('search-results');
    if (!input || !resultsEl) return;

    input.addEventListener('input', function () {
      clearTimeout(searchTimer);
      var query = input.value.trim();
      if (query.length < 2) {
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
        addToCart(product);
        input.value = '';
        resultsEl.classList.add('hidden');
      }
    });
  }

  function searchProducts(query) {
    var resultsEl = document.getElementById('search-results');

    // First try exact barcode match
    api.get('/products?barcode=' + encodeURIComponent(query)).then(function (products) {
      if (products && products.length > 0) {
        renderSearchResults(resultsEl, products);
        return;
      }
      // Fallback to name search
      return api.get('/products?name=' + encodeURIComponent(query)).then(function (nameProducts) {
        renderSearchResults(resultsEl, nameProducts);
      });
    }).catch(function () {
      resultsEl.innerHTML = '<div class="search-no-results">Error al buscar</div>';
      resultsEl.classList.remove('hidden');
    });
  }

  function renderSearchResults(resultsEl, products) {
    if (!products || products.length === 0) {
      resultsEl.innerHTML = '<div class="search-no-results">No se encontraron productos</div>';
    } else {
      var html = '';
      for (var i = 0; i < products.length; i++) {
        var p = products[i];
        var productData = JSON.stringify({ id: p.id, name: p.name, price: p.price, stock: p.stock }).replace(/"/g, '&quot;');
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
  // Barcode Scanner (Camera)
  // ----------------------------------------------------------
  var scannerStream = null;
  var scannerActive = false;
  var codeReader = null;

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
    if (!overlay || !video) return;

    overlay.classList.remove('hidden');
    statusEl.textContent = 'Iniciando cámara...';
    scannerActive = true;

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    }).then(function (stream) {
      scannerStream = stream;
      video.srcObject = stream;
      video.play();
      statusEl.textContent = 'Apunte la cámara al código de barras';
      startBarcodeDetection(video, statusEl);
    }).catch(function (err) {
      statusEl.textContent = 'No se pudo acceder a la cámara';
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
    var statusEl = document.getElementById('scanner-status');
    api.get('/products?barcode=' + encodeURIComponent(code)).then(function (products) {
      if (products && products.length > 0) {
        var p = products[0];
        addToCart({ id: p.id, name: p.name, price: p.price, stock: p.stock });
      } else {
        showToast('Producto no encontrado: ' + code, 'warning');
      }
    }).catch(function () {
      showToast('Error al buscar producto', 'error');
    });
  }

  function closeScanner() {
    scannerActive = false;
    var overlay = document.getElementById('scanner-overlay');
    if (overlay) overlay.classList.add('hidden');
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

    var total = getCartTotal();

    if (cart.length === 0) {
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
    if (btnPay) btnPay.disabled = true;

    var lines = cart.map(function (item) {
      return { product_id: item.product_id, quantity: item.quantity };
    });

    var body = {
      lines: lines,
      payment_method: selectedPaymentMethod,
    };

    if (selectedPaymentMethod === 'efectivo') {
      var amountInput = document.getElementById('amount-received');
      body.amount_received = parseInt(amountInput ? amountInput.value : '0', 10) || 0;
    }

    if (!navigator.onLine) {
      OfflineDB.savePendingSale(body).then(function () {
        clearCart();
        resetPaymentForm();
        showToast('Sin conexión: Venta encolada para sincronizar', 'warning');
        if (btnPay) btnPay.disabled = false;
      }).catch(function () {
        showToast('Error al guardar venta offline', 'error');
        if (btnPay) btnPay.disabled = false;
      });
      return;
    }

    api.post('/sales', body).then(function (result) {
      // result: { sale, critical_stock_alerts, receipt }
      clearCart();
      resetPaymentForm();

      if (result.receipt) {
        showReceipt(result.receipt);
      } else {
        showToast('Venta registrada', 'success');
      }
    }).catch(function (err) {
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
    });
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
    // receipt: { store_name, date, items, total, payment_method, amount_received, change_amount, boleta_folio }
    var content = document.getElementById('receipt-content');
    if (!content) return;

    var html = '';
    html += '<div class="receipt-store-name">' + escapeHtml(receipt.store_name) + '</div>';
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
    }

    html += '<hr class="receipt-divider">';
    html += '<div class="receipt-footer">¡Gracias por su compra!</div>';

    content.innerHTML = html;
    router.navigate('receipt');
  }

  function initReceipt() {
    var btnClose = document.getElementById('btn-close-receipt');
    if (btnClose) {
      btnClose.addEventListener('click', function () {
        router.navigate('sale');
      });
    }
  }

  // ----------------------------------------------------------
  // Sales History
  // ----------------------------------------------------------
  function loadHistory() {
    var listEl = document.getElementById('history-list');
    if (!listEl) return;
    listEl.innerHTML = '<p class="history-empty">Cargando ventas...</p>';

    // Get today's sales
    var now = new Date();
    var y = now.getFullYear();
    var m = String(now.getMonth() + 1).padStart(2, '0');
    var d = String(now.getDate()).padStart(2, '0');
    var todayStr = y + '-' + m + '-' + d;

    var dateFrom = todayStr;
    var dateTo = todayStr + 'T23:59:59Z';

    api.get('/sales?date_from=' + encodeURIComponent(dateFrom) + '&date_to=' + encodeURIComponent(dateTo))
      .then(function (sales) {
        if (!sales || sales.length === 0) {
          listEl.innerHTML = '<p class="history-empty">No hay ventas hoy</p>';
          return;
        }
        var html = '';
        for (var i = 0; i < sales.length; i++) {
          var sale = sales[i];
          var methodLabel = sale.payment_method === 'efectivo' ? '💵 Efectivo' : '💳 Tarjeta';
          var boletaClass = sale.boleta_status || 'no_aplica';
          var boletaLabel = boletaStatusLabel(sale.boleta_status);

          html +=
            '<div class="history-item" data-sale-id="' + sale.id + '">' +
            '<div class="history-item-left">' +
            '<span class="history-item-time">' + formatTime(sale.created_at) + '</span>' +
            '<span class="history-item-method">' + methodLabel + '</span>' +
            '</div>' +
            '<div class="history-item-right">' +
            '<div class="history-item-total">' + formatCLP(sale.total) + '</div>' +
            '<span class="boleta-badge ' + boletaClass + '">' + boletaLabel + '</span>' +
            '</div>' +
            '</div>';
        }
        listEl.innerHTML = html;
      })
      .catch(function () {
        listEl.innerHTML = '<p class="history-empty">Error al cargar ventas</p>';
      });
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
        var item = e.target.closest('.history-item');
        if (item && item.dataset.saleId) {
          viewSaleReceipt(item.dataset.saleId);
        }
      });
    }
  }

  function viewSaleReceipt(saleId) {
    api.get('/sales/' + saleId + '/receipt').then(function (receipt) {
      showReceipt(receipt);
    }).catch(function () {
      showToast('Error al cargar comprobante', 'error');
    });
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
      if (action === 'inc') updateItemQty(id, 1);
      else if (action === 'dec') updateItemQty(id, -1);
      else if (action === 'remove') removeFromCart(id);
    });

    var btnClear = document.getElementById('btn-clear-cart');
    if (btnClear) {
      btnClear.addEventListener('click', function () {
        if (cart.length === 0) return;
        showConfirm('¿Vaciar el carrito?').then(function (confirmed) {
          if (confirmed) clearCart();
        });
      });
    }
  }

  // ----------------------------------------------------------
  // Auth — login / logout
  // ----------------------------------------------------------
  function initAuth() {
    var form = document.getElementById('login-form');
    var errorEl = document.getElementById('login-error');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errorEl.classList.add('hidden');

      var email = document.getElementById('login-email').value.trim();
      var password = document.getElementById('login-password').value;

      if (!email || !password) {
        showLoginError('Ingrese correo y contraseña');
        return;
      }

      api.post('/auth/login', { email: email, password: password }).then(function (data) {
        api.setToken(data.accessToken);
        router.navigate('sale');
      }).catch(function () {
        showLoginError('Credenciales inválidas');
      });
    });

    function showLoginError(msg) {
      errorEl.textContent = msg;
      errorEl.classList.remove('hidden');
    }
  }

  function initLogout() {
    var btn = document.getElementById('btn-logout');
    if (btn) {
      btn.addEventListener('click', function () {
        api.clearToken();
        cart = [];
        router.navigate('login');
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
      navigator.serviceWorker
        .register('/service-worker.js')
        .catch(function (err) {
          console.warn('SW registration failed:', err);
        });
    }
  }

  // ----------------------------------------------------------
  // Offline Sync
  // ----------------------------------------------------------
  async function syncOfflineSales() {
    try {
      const pending = await OfflineDB.getPendingSales();
      if (pending && pending.length > 0) {
        showToast('Sincronizando ' + pending.length + ' ventas offline...', 'success');
        for (let i = 0; i < pending.length; i++) {
          const sale = pending[i];
          try {
            await api.post('/sales', sale.payload);
            await OfflineDB.deletePendingSale(sale.id);
          } catch (err) {
            console.error('Error sincronizando venta:', err);
          }
        }
        showToast('Ventas offline sincronizadas', 'success');
        if (router.currentScreen === 'history') {
          loadHistory();
        }
      }
    } catch (err) {
      console.error('Error al obtener ventas pendientes:', err);
    }
  }

  window.addEventListener('online', syncOfflineSales);

  // ----------------------------------------------------------
  // App Init
  // ----------------------------------------------------------
  function init() {
    registerServiceWorker();
    initAuth();
    initLogout();
    initNav();
    initSearch();
    initScanner();
    initCartEvents();
    initPayment();
    initReceipt();
    initHistory();

    // Global auth expiration listener
    window.addEventListener('monay-auth-expired', function () {
      router.navigate('login');
    });

    // Sync if online
    if (navigator.onLine) {
      syncOfflineSales();
    }

    // If we have a token, go to sale screen; otherwise login
    if (api.getToken()) {
      router.navigate('sale');
    } else {
      router.navigate('login');
    }
  }

  // Expose api and router for future modules
  window.MonayPOS = { api: api, router: router, CONFIG: CONFIG };

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
