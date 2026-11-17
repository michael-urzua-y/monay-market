// Dónde corre la caja: en la app Android nativa (Capacitor) o en el navegador.
// Capacitor inyecta window.Capacitor en toda página que carga su WebView.
export function isNativeApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

/** Carga un archivo de src/vendor/ con la misma versión (?v) que este módulo. */
export function loadVendorScript(file) {
  return new Promise(function (resolve, reject) {
    var script = document.createElement('script');
    script.src = new URL('vendor/' + file + new URL(import.meta.url).search, import.meta.url).href;
    script.async = false;
    script.addEventListener('load', resolve, { once: true });
    script.addEventListener('error', reject, { once: true });
    document.head.appendChild(script);
  });
}

var corePromise = null;

/**
 * @capacitor/core (global capacitorExports): lo necesitan los plugins nativos.
 * Una app con empaquetador lo incluye sola; la caja carga módulos sin
 * empaquetador y el WebView solo inyecta el puente nativo, así que se carga
 * vendor/capacitor-core.js (se copia con `npm run vendor:sync`).
 */
export function loadCapacitorCore() {
  if (window.capacitorExports) return Promise.resolve(window.capacitorExports);
  if (!corePromise) {
    corePromise = loadVendorScript('capacitor-core.js').then(function () {
      if (!window.capacitorExports) throw new Error('capacitor-core sin cargar');
      return window.capacitorExports;
    }).catch(function (err) {
      corePromise = null;
      throw err;
    });
  }
  return corePromise;
}
