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
        qtyHtml = '<span class="qty-value" style="margin: 0 10px; font-size: 0.9rem; color: #3b82f6; font-weight: 600;">' + Number(item.quantity).toFixed(3) + ' Kg</span>';
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
    if (btnPay) btnPay.disabled = true;

    var lines = Cart.items.map(function (item) {
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
        Cart.clear();
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
      Cart.clear();
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
  var historyState = {
    efectivo: [],
    tarjeta: [],
    pageEfectivo: 1,
    pageTarjeta: 1,
    perPage: 5
  };

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
        if (!sales) sales = [];
        historyState.efectivo = sales.filter(function(s) { return s.payment_method === 'efectivo'; });
        historyState.tarjeta = sales.filter(function(s) { return s.payment_method === 'tarjeta'; });
        historyState.pageEfectivo = 1;
        historyState.pageTarjeta = 1;
        renderHistoryView();
      })
      .catch(function () {
        listEl.innerHTML = '<p class="history-empty">Error al cargar ventas</p>';
      });
  }

  function renderHistoryView() {
    var listEl = document.getElementById('history-list');
    if (!listEl) return;

    var totalEfe = historyState.efectivo.reduce(function(sum, s) { return sum + s.total; }, 0);
    var totalTar = historyState.tarjeta.reduce(function(sum, s) { return sum + s.total; }, 0);
    var granTotal = totalEfe + totalTar;

    // Wrapper con fondo gris suave para que las tarjetas resalten
    var html = '<div style="background-color: #f8fafc; padding: 20px; border-radius: 12px; min-height: 100%;">';

    // Tarjetas de Totales
    var cardStyle = 'background: white; border-radius: 10px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; flex: 1; padding: 20px; text-align: center; min-width: 100px;';
    html += '<div style="display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap;">';
    html += '<div style="' + cardStyle + '"><div style="color: #64748b; font-size: 0.9rem; margin-bottom: 8px;">Efectivo</div><div style="font-size: 1.5rem; font-weight: bold; color: #16a34a;">' + formatCLP(totalEfe) + '</div></div>';
    html += '<div style="' + cardStyle + '"><div style="color: #64748b; font-size: 0.9rem; margin-bottom: 8px;">Tarjeta</div><div style="font-size: 1.5rem; font-weight: bold; color: #2563eb;">' + formatCLP(totalTar) + '</div></div>';
    html += '<div style="' + cardStyle + '"><div style="color: #64748b; font-size: 0.9rem; margin-bottom: 8px;">Total</div><div style="font-size: 1.5rem; font-weight: bold; color: #0f172a;">' + formatCLP(granTotal) + '</div></div>';
    html += '</div>';

    // Tablas
    html += '<div style="display: flex; flex-wrap: wrap; gap: 20px;">';
    
    // Columna Efectivo
    html += '<div style="flex: 1 1 320px; min-width: 0;">';
    html += '<h3 style="margin-bottom: 16px; font-size: 1.1rem; color: #334155; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">Ventas en Efectivo</h3>';
    html += renderHistoryTable(historyState.efectivo, historyState.pageEfectivo, 'efectivo');
    html += '</div>';

    // Columna Tarjeta
    html += '<div style="flex: 1 1 320px; min-width: 0;">';
    html += '<h3 style="margin-bottom: 16px; font-size: 1.1rem; color: #334155; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">Ventas con Tarjeta</h3>';
    html += renderHistoryTable(historyState.tarjeta, historyState.pageTarjeta, 'tarjeta');
    html += '</div>';

    html += '</div></div>'; // Fin del contenedor flex y del wrapper gris

    listEl.innerHTML = html;
  }

  function renderHistoryTable(salesArray, page, method) {
    if (salesArray.length === 0) {
      var emptyStyle = 'background: white; border-radius: 10px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; padding: 24px; text-align: center; color: #64748b;';
      return '<div style="' + emptyStyle + '">No hay ventas registradas.</div>';
    }

    var totalPages = Math.ceil(salesArray.length / historyState.perPage);
    if (totalPages === 0) totalPages = 1;
    if (page > totalPages) page = totalPages;

    var start = (page - 1) * historyState.perPage;
    var end = start + historyState.perPage;
    var paginatedSales = salesArray.slice(start, end);

    var tableCardStyle = 'background: white; border-radius: 10px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0; overflow: hidden;';
    var html = '<div style="' + tableCardStyle + '"><div style="overflow-x: auto; padding: 0;">';
    html += '<table class="data-table" style="margin: 0; width: 100%; white-space: nowrap; border-collapse: collapse;">';
    html += '<thead style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;"><tr><th style="text-align: left; padding: 12px 16px; color: #64748b; font-weight: 600;">Hora</th><th style="text-align: left; padding: 12px 16px; color: #64748b; font-weight: 600;">Total</th><th style="text-align: left; padding: 12px 16px; color: #64748b; font-weight: 600;">Estado Boleta</th><th style="text-align: left; padding: 12px 16px; color: #64748b; font-weight: 600;">Acción</th></tr></thead>';
    html += '<tbody>';

    for (var i = 0; i < paginatedSales.length; i++) {
      var sale = paginatedSales[i];
      var boletaLabel = boletaStatusLabel(sale.boleta_status);
      var badgeType = 'neutral';
      if (sale.boleta_status === 'emitida') badgeType = 'success';
      if (sale.boleta_status === 'pendiente') badgeType = 'warning';
      if (sale.boleta_status === 'error') badgeType = 'error';

      html += '<tr style="border-bottom: 1px solid #e2e8f0;">';
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
          viewSaleReceipt(btnView.dataset.saleId);
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
        Cart.clear();
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
    Cart.init(updateCartUI, showToast);
    initAuth();
    initLogout();
    initNav();
    initSearch();
    initScanner();
    initWeighModal();
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
