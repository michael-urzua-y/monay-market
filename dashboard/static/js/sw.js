// Service worker del sitio (panel y login). La caja (/pos/) tiene el suyo propio,
// que tiene prioridad en sus páginas por tener un alcance más específico.
//
// El panel necesita el servidor para todo, así que aquí no se guarda nada en caché:
// solo se muestra un aviso claro si se abre la app sin conexión.

const OFFLINE_HTML = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sin conexión · Monay</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; font-family: system-ui, sans-serif;
         background: #020a0a; color: #f6faed; text-align: center; padding: 24px; box-sizing: border-box; }
  h1 { color: #f0b90b; font-size: 1.4rem; margin: 0 0 8px; }
  p { color: rgba(231, 238, 224, 0.75); margin: 0 0 20px; line-height: 1.4; }
  button { background: #f0b90b; color: #12160e; border: 0; border-radius: 10px; padding: 12px 22px;
           font-weight: 700; font-size: 1rem; }
</style></head>
<body><main>
  <h1>Sin conexión</h1>
  <p>Monay necesita internet para el panel.<br>La caja sigue funcionando y sincroniza al volver la conexión.</p>
  <button onclick="location.reload()">Reintentar</button>
</main></body></html>`;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || request.mode !== 'navigate') return; // el resto va directo a la red
  const url = new URL(request.url);
  if (url.pathname.startsWith('/pos/') || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(request).catch(
      () => new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
    ),
  );
});
