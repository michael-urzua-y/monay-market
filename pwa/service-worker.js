const CACHE_NAME = 'monay-pos-v17';
const scopePath = new URL(self.registration.scope).pathname;
const basePath = scopePath.endsWith('/') ? scopePath : scopePath + '/';
const appPath = (path) => basePath + path.replace(/^\//, '');
const APP_SHELL = [
  basePath,
  appPath('index.html'),
  appPath('src/api.js'),
  appPath('src/app.js'),
  appPath('src/cart.js'),
  appPath('src/offline.js'),
  appPath('src/styles.css'),
  appPath('manifest.json'),
  '/runtime-config.js',
];

// Install: cache app shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: cache-first for app shell, network-first for API calls
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Lista de todas las rutas que pertenecen al Backend (API)
  const apiRoutes = ['/api/', '/auth/', '/sales', '/products', '/users', '/tenant', '/cart', '/dashboard', '/mermas'];
  const isApiRequest = apiRoutes.some(route => url.pathname.startsWith(route));

  // Network-first for API requests
  if (isApiRequest) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(
          JSON.stringify({ error: 'OFFLINE', message: 'Sin conexión a internet' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })
    );
    return;
  }

  // Cache-first for app shell assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(event.request).then((response) => {
        // Cache successful GET responses for static assets
        if (event.request.method === 'GET' && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});
