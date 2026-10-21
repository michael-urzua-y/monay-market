// Campos de RUT chileno (input[data-rut]): formato mientras se escribe ("123456785" → "12.345.678-5")
// y validación del dígito verificador antes de enviar el formulario.
// El servidor vuelve a validar: esto solo evita errores y deja claro el formato esperado.
(function () {
  function clean(value) {
    return String(value || '').toUpperCase().replace(/[^0-9K]/g, '');
  }

  function computeDv(body) {
    var sum = 0;
    var factor = 2;
    for (var i = body.length - 1; i >= 0; i--) {
      sum += Number(body[i]) * factor;
      factor = factor === 7 ? 2 : factor + 1;
    }
    var dv = 11 - (sum % 11);
    return dv === 11 ? '0' : dv === 10 ? 'K' : String(dv);
  }

  function isValid(value) {
    var c = clean(value);
    if (c.length < 8 || c.length > 9) return false;
    var body = c.slice(0, -1);
    return /^[1-9]\d{6,7}$/.test(body) && computeDv(body) === c.slice(-1);
  }

  /** Formato parcial mientras se escribe: el último carácter es el dígito verificador. */
  function format(value) {
    var c = clean(value).slice(0, 9);
    if (c.length < 2) return c;
    var body = c.slice(0, -1).replace(/K/g, '');
    return body.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + c.slice(-1);
  }

  function feedbackFor(input) {
    var el = input.parentNode.querySelector('.rut-feedback');
    if (!el) {
      el = document.createElement('small');
      el.className = 'rut-feedback';
      el.setAttribute('aria-live', 'polite');
      input.insertAdjacentElement('afterend', el);
    }
    return el;
  }

  function check(input, final) {
    var value = input.value.trim();
    var feedback = feedbackFor(input);
    if (!value) {
      input.setCustomValidity('');
      input.classList.remove('rut-invalid', 'rut-valid');
      feedback.textContent = '';
      return;
    }
    var valid = isValid(value);
    var complete = clean(value).length >= 8;
    input.setCustomValidity(valid ? '' : 'RUT inválido: revisa los números y el dígito verificador');
    input.classList.toggle('rut-valid', valid);
    input.classList.toggle('rut-invalid', !valid && (final || complete));
    feedback.className = 'rut-feedback' + (valid ? ' is-valid' : !valid && (final || complete) ? ' is-error' : '');
    feedback.textContent = valid
      ? 'RUT válido'
      : final || complete
        ? 'RUT inválido: revisa los números y el dígito verificador (ej: 12.345.678-5)'
        : '';
  }

  function attach(input) {
    if (input.__rutReady) return;
    input.__rutReady = true;
    input.setAttribute('autocapitalize', 'characters');
    input.setAttribute('spellcheck', 'false');
    input.addEventListener('input', function () {
      var formatted = format(input.value);
      if (formatted !== input.value) input.value = formatted;
      check(input, false);
    });
    input.addEventListener('blur', function () {
      check(input, true);
    });
    if (input.value) {
      input.value = format(input.value);
      check(input, true);
    }
  }

  function init(root) {
    (root || document).querySelectorAll('input[data-rut]').forEach(attach);
  }

  document.addEventListener('DOMContentLoaded', function () {
    init(document);
  });
  // Contenido cargado con HTMX
  document.addEventListener('htmx:afterSwap', function (e) {
    init(e.target);
  });
})();
