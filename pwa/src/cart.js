export const Cart = {
  items: [],
  callbacks: {
    onUpdate: function () {},
    onToast: function (msg, type) {}
  },

  init: function (onUpdateCb, onToastCb) {
    this.callbacks.onUpdate = onUpdateCb;
    this.callbacks.onToast = onToastCb;
  },

  getTotal: function () {
    var total = 0;
    for (var i = 0; i < this.items.length; i++) {
      total += this.items[i].subtotal;
    }
    return total;
  },

  add: function (product, qty) {
    var quantity = qty || 1;
    var existing = null;
    for (var i = 0; i < this.items.length; i++) {
      if (this.items[i].product_id === product.id) {
        existing = this.items[i];
        break;
      }
    }
    if (existing) {
      var newQty = existing.quantity + quantity;
      if (newQty > existing.available_stock) {
        this.callbacks.onToast('Stock insuficiente. Disponible: ' + existing.available_stock, 'warning');
        return;
      }
      existing.quantity = Math.round(newQty * 1000) / 1000;
      existing.subtotal = Math.round(existing.unit_price * existing.quantity);
    } else {
      if (product.stock < quantity) {
        this.callbacks.onToast('Producto sin stock disponible', 'warning');
        return;
      }
      this.items.push({
        product_id: product.id,
        product_name: product.name,
        unit_price: product.price,
        quantity: Math.round(quantity * 1000) / 1000,
        subtotal: Math.round(product.price * quantity),
        available_stock: product.stock,
        is_weighed: product.is_weighed || false
      });
    }
    this.callbacks.onUpdate();
    this.callbacks.onToast(product.name + ' agregado', 'success');
  },

  updateQty: function (productId, delta) {
    for (var i = 0; i < this.items.length; i++) {
      if (this.items[i].product_id === productId) {
        var newQty = this.items[i].quantity + delta;
        if (newQty < 1) {
          this.remove(productId);
          return;
        }
        if (newQty > this.items[i].available_stock) {
          this.callbacks.onToast('Stock insuficiente. Disponible: ' + this.items[i].available_stock, 'warning');
          return;
        }
        this.items[i].quantity = newQty;
        this.items[i].subtotal = Math.round(this.items[i].unit_price * newQty);
        break;
      }
    }
    this.callbacks.onUpdate();
  },

  remove: function (productId) {
    var newItems = [];
    for (var i = 0; i < this.items.length; i++) {
      if (this.items[i].product_id !== productId) {
        newItems.push(this.items[i]);
      }
    }
    this.items = newItems;
    this.callbacks.onUpdate();
  },

  clear: function () {
    this.items = [];
    this.callbacks.onUpdate();
  }
};