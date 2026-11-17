// Dónde corre la caja: en la app Android nativa (Capacitor) o en el navegador.
// Capacitor inyecta window.Capacitor en toda página que carga su WebView.
export function isNativeApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}
