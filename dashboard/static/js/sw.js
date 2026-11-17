// Service worker de retiro. El sitio dejó de ser una app instalable (el cajero
// usa la app Android), pero los navegadores que registraron el anterior lo
// siguen pidiendo en /sw.js. Este se activa, se desinstala y ya no intercepta
// nada. No afecta al de la caja (/pos/service-worker.js), que es otro registro.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(self.registration.unregister());
});
