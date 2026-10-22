// Invitación a instalar Monay como app, solo en celulares y tablets.
//
// Una sola app para todos los perfiles: se abre en /login y cada usuario llega a lo suyo
// (dueño → panel, cajero → caja). Lo usan el login, el panel y la caja.
//
// <script defer src="/static/js/install.js" data-position="top|bottom" data-sw="off"></script>
//  - data-position: dónde aparece el aviso (por defecto abajo).
//  - data-sw="off": no registrar el service worker del sitio (la caja tiene el suyo).
(function () {
  var DISMISS_KEY = 'monay_install_dismissed_until';
  var DISMISS_DAYS = 7;
  var script = document.currentScript;
  var position = (script && script.dataset.position) || 'bottom';
  var registerSw = !(script && script.dataset.sw === 'off');
  var deferredPrompt = null;
  var banner = null;

  // ---------- Requisitos para que Chrome ofrezca instalar ----------
  if (!document.querySelector('link[rel="manifest"]')) {
    var manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = '/manifest.webmanifest';
    document.head.appendChild(manifest);
  }
  if (registerSw && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {});
  }

  // ---------- Detección ----------
  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  function isIos() {
    var ua = navigator.userAgent;
    // iPadOS se presenta como "Macintosh", pero con pantalla táctil
    return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }

  function isMobileOrTablet() {
    var uaData = navigator.userAgentData;
    if (uaData && uaData.mobile) return true;
    return isIos() || /Android|Mobile|Tablet/i.test(navigator.userAgent);
  }

  function isDismissed() {
    try {
      return Number(localStorage.getItem(DISMISS_KEY) || 0) > Date.now();
    } catch (e) {
      return false;
    }
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000));
    } catch (e) {
      // Sin almacenamiento: se oculta solo en esta visita
    }
    hide();
  }

  // ---------- Aviso ----------
  function hide() {
    if (banner) banner.remove();
    banner = null;
  }

  function showSteps(html) {
    var steps = banner && banner.querySelector('.monay-install__steps');
    if (!steps) return;
    steps.innerHTML = html;
    steps.hidden = false;
  }

  var IOS_STEPS =
    '<ol><li>Toca <strong>Compartir</strong> <span aria-hidden="true">⎋</span> en la barra de Safari.</li>' +
    '<li>Elige <strong>"Agregar a inicio"</strong>.</li><li>Toca <strong>Agregar</strong>.</li></ol>';
  var ANDROID_STEPS =
    '<ol><li>Toca el menú <strong>⋮</strong> arriba a la derecha.</li>' +
    '<li>Elige <strong>"Instalar app"</strong> o <strong>"Agregar a pantalla de inicio"</strong>.</li></ol>';

  function onInstall() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice
        .then(function (choice) {
          if (choice.outcome === 'accepted') hide();
        })
        .finally(function () {
          deferredPrompt = null;
        });
      return;
    }
    showSteps(isIos() ? IOS_STEPS : ANDROID_STEPS);
  }

  function render() {
    if (banner || !document.body) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/static/css/install.css';
    document.head.appendChild(link);

    banner = document.createElement('section');
    banner.className = 'monay-install monay-install--' + (position === 'top' ? 'top' : 'bottom');
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Instalar Monay Market');
    banner.innerHTML =
      '<img class="monay-install__icon" src="/static/icons/icon-192x192.png" alt="" width="44" height="44">' +
      '<div class="monay-install__body">' +
      '<strong>Instala Monay Market</strong>' +
      '<p>Ábrela desde la pantalla de inicio de tu ' + (/iPad|Tablet/i.test(navigator.userAgent) ? 'tablet' : 'celular') + ': más rápida y en pantalla completa.</p>' +
      '<div class="monay-install__steps" hidden></div>' +
      '<div class="monay-install__actions">' +
      '<button type="button" class="monay-install__primary">' + (isIos() ? 'Cómo instalar' : 'Instalar') + '</button>' +
      '<button type="button" class="monay-install__later">Ahora no</button>' +
      '</div></div>';
    banner.querySelector('.monay-install__primary').addEventListener('click', onInstall);
    banner.querySelector('.monay-install__later').addEventListener('click', dismiss);
    document.body.appendChild(banner);
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); // el aviso propio reemplaza al de Chrome
    deferredPrompt = e;
  });
  window.addEventListener('appinstalled', hide);

  if (!isMobileOrTablet() || isStandalone() || isDismissed()) return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
  else render();
})();
