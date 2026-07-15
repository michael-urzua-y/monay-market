# Monay Market

Sistema SaaS de punto de venta (POS) y gestión de inventario para almacenes de barrio y minimarkets en Chile.

## Arquitectura

```
monay-market/
├── api/               → Backend NestJS + TypeScript
├── dashboard/         → Panel Admin Flask + HTMX + Alpine.js
├── pwa/               → PWA Punto de Venta (vanilla JS)
├── docker/            → Nginx y entrypoints del stack unificado
├── proxy-squid/       → Proxy HTTP opcional para integraciones SII vía API Gateway
├── postgres/          → Variables de entorno y persistencia local de PostgreSQL
└── README.md
```

## Stack Tecnológico

| Componente | Tecnología |
|------------|-----------|
| Backend API | NestJS + TypeScript |
| Base de datos | PostgreSQL (local) |
| ORM | TypeORM |
| Autenticación | JWT + Passport + bcrypt |
| Panel Admin | Flask + Jinja2 + HTMX + Alpine.js |
| POS | PWA con JavaScript vanilla + Service Worker + IndexedDB |
| Testing | Jest + fast-check (property-based testing) |

## Características implementadas

### API Backend (NestJS)
- Multi-tenant con aislamiento por `tenant_id` en todas las tablas (esquema `market`)
- Autenticación JWT con roles diferenciados (dueño / cajero)
- Rate limit de login persistido en PostgreSQL para que siga funcionando en Docker/VPS y no dependa de memoria local
- Guards: JwtAuth, Tenant, Roles, Subscription, Plan
- Gestión de usuarios cajeros (CRUD, solo dueño)
- Configuración de tenant: módulo SII y datos de impresora térmica
- Cifrado en reposo de secretos sensibles del tenant (`sii_api_key`, `sii_clave_tributaria`, `sii_certificado_password`) usando `APP_DATA_ENCRYPTION_KEY`
- Control de suscripción: planes Básico y Pro
- CRUD de productos con soft-delete, validación de ventas recientes e indicador de venta a granel (`is_weighed`)
- Soporte para productos a granel con control de stock y cantidades en decimales de alta precisión (numeric(10,3) en PostgreSQL)
- Migración automática para convertir stock entero a decimal con 3 decimales
- Lookup de código de barras multi-fuente: Open Food Facts → UPCItemDB → Open Beauty Facts → UPCDatabase → JustBC (con fallback encadenado y URLs configurables por env)
- Importación masiva de productos desde Excel (.xlsx) con validación de formato
- Descarga de plantilla Excel oficial para importación
- Validación server-side del carrito (stock, subtotales, total)
- Registro de ventas con transacción atómica y SELECT ... FOR UPDATE
- Pago efectivo (cálculo de vuelto) y tarjeta
- Deducción de stock atómica (unidades y fracciones) con alertas de stock crítico
- Cierre de caja: resumen diario desglosado y registro de cuadratura (arqueo)
- Módulo SII opcional: emisión de boleta electrónica con reintentos (3 intentos, 15s timeout), soporte Haulmer/OpenFactura/Facturación.cl/SimpleAPI/BaseAPI/API Gateway eBoleta, IVA 19%
- Reintento manual de boletas pendientes
- Dashboard de métricas: ventas del día, acumulado mensual con variación %, gráfico diario con selector de mes, stock crítico, valorización inventario (plan Pro)
- Comprobante visual estructurado con datos de tienda, productos, pago y boleta
- WebSocket Gateway con autenticación JWT: eventos sale:created, stock:updated, stock:critical filtrados por tenant
- Módulo de mermas: registro de pérdidas de inventario por causas (vencido, roto, robo, consumo interno), estadísticas mensuales

### Panel Admin (Flask + HTMX)
- Login con JWT almacenado en sesión Flask
- Login unificado en `/login`: si entra un `dueno` va al dashboard, si entra un `cajero` va al POS
- Dashboard con métricas auto-refresh vía HTMX: ventas del día, acumulado mensual, valorización inventario, gráfico diario (Chart.js), productos con stock crítico (paginado)
- Gestión de productos: CRUD completo con soporte inteligente para productos a granel (decimales), búsqueda en tiempo real con HTMX, paginación server-side, barcode lookup con autocompletado, escáner de cámara
- Asistente Inteligente de Compras: generación automática de lista de reposición optimizada para móviles, calculando faltantes y agrupada por categorías
- Ventas: listado con filtros por fecha (desde/hasta) y estado de boleta, paginación, detalle de venta, reintento de boletas pendientes
- Usuarios: gestión de cajeros (crear, activar/desactivar)
- Configuración: módulo SII (proveedor, credenciales, sandbox), impresora térmica, estado de suscripción y certificado digital
- Mermas: registro de pérdidas de inventario (causa, cantidad, valor), estadísticas mensuales, paginación
- Librerías frontend servidas localmente (`htmx`, `alpine`, `chart.js`) para no depender de CDN externos

### PWA Punto de Venta
- Instalable en celular como app nativa (manifest.json + íconos PWA 192x192 y 512x512)
- Service Worker: cache-first para assets, network-first para API, respuesta offline 503
- Login con JWT efímero almacenado en `sessionStorage`
- Búsqueda de productos por nombre o código de barras
- Escáner de código de barras con cámara (BarcodeDetector API)
- "Calculadora Mágica" para productos a granel (ingreso de peso exacto o monto a cobrar con cálculo automático)
- Carrito modular (`cart.js`): agregar, modificar cantidad, eliminar, vaciar, control de stock
- Pago efectivo con cálculo de vuelto y pago con tarjeta
- Comprobante visual post-venta con timbre electrónico SII y enlace a PDF
- Historial de ventas del día con paginación
- Arqueo de Caja Visual: herramienta interactiva para contar billetes/monedas chilenas y cuadrar el turno
- Modo offline: ventas pendientes guardadas en IndexedDB, sincronización automática al recuperar conexión
- Cliente HTTP centralizado (`api.js`) con manejo de expiración de token
- Botones de monto rápido para vuelto ($1.000, $2.000, $5.000, $10.000, $20.000)

## Base de datos

Todas las tablas de negocio viven en el esquema `market` (la tabla de migraciones queda en `public`).

| Tabla | Descripción | Datos seed |
|-------|------------|-----------|
| `tenants` | Tiendas/clientes del sistema. Cada tenant es un almacén independiente con sus propios datos aislados | 1 tenant |
| `tenant_configs` | Configuración por tenant: módulo SII (activar/desactivar, credenciales proveedor) e impresora térmica | 1 config |
| `subscriptions` | Plan de suscripción del tenant (Básico o Pro), fechas de vigencia y estado | 1 suscripción |
| `users` | Usuarios del sistema con roles dueño (administrador) o cajero (operador POS). Contraseñas hasheadas con bcrypt | 2 usuarios |
| `categories` | Categorías de productos por tenant (Bebidas, Snacks, Lácteos, Abarrotes, etc.) | 10 categorías |
| `products` | Catálogo de productos con nombre, código de barras, precio CLP, stock (entero o decimal), umbral de stock crítico e indicador a granel (`is_weighed`) | 42 productos |
| `sales` | Ventas registradas con total, método de pago (efectivo/tarjeta), monto recibido, vuelto y estado de boleta SII | vacía (se llena al vender) |
| `sale_lines` | Líneas de detalle de cada venta: producto, cantidad (entera o fraccional), precio unitario y subtotal | vacía |
| `boletas` | Boletas electrónicas emitidas ante el SII: folio, timbre electrónico, PDF y proveedor | vacía |
| `mermas` | Registro de pérdidas de inventario por causa (vencido, roto, robo, consumo interno) | vacía |
| `login_rate_limits` | Buckets persistidos para rate limit de login por IP/identificador | vacía |

## Requisitos

- Node.js >= 18
- Python >= 3.10
- PostgreSQL >= 14

## Setup local

```bash
# Clonar el repo
git clone https://github.com/michael-urzua-y/monay-market.git
cd monay-market

# --- API Backend ---
cd api
npm install
cp .env.example .env
# Editar .env con tus credenciales de PostgreSQL local
createdb monay_market
npm run migration:run
npm test
npm run start:dev

# --- Dashboard Admin ---
cd ../dashboard
pip install -r requirements.txt
cp .env.example .env
# Editar .env con API_URL y SECRET_KEY
python app.py

# --- PWA ---
# Servir la carpeta pwa/ con cualquier servidor estático
# Ejemplo: npx serve pwa/ -l 8080
# Abrir en el celular y agregar a pantalla de inicio para instalar
```

## Setup con Docker

El stack Docker levanta PostgreSQL, API NestJS, PWA, Dashboard Flask y un proxy Nginx para usar un solo dominio/puerto.

```bash
cp postgres/.env.example postgres/.env
cp api/.env.example api/.env
cp dashboard/.env.example dashboard/.env
# Editar cada .env con sus secrets reales antes de levantar.

docker compose up --build
```

URLs por defecto:

| Servicio | URL |
|----------|-----|
| Acceso unificado | http://localhost:8080 |
| POS dentro del acceso unificado | http://localhost:8080/pos/ |
| API dentro del acceso unificado | http://localhost:8080/api/ |
| API, Dashboard y PostgreSQL | internos en Docker |

El login unificado vive en `/login`. Si el usuario autenticado tiene rol `dueno`, entra al dashboard; si tiene rol `cajero`, entra al POS. Al cerrar sesión desde el POS, el cajero vuelve al login central. Las credenciales y roles salen desde la base de datos, no desde Docker ni desde archivos del frontend.
En Docker, solo el servicio `web` publica un puerto. El API (`3000`) y el dashboard Flask (`5000`) quedan internos en la red Docker para evitar entradas paralelas y logins duplicados. En VPS, publicar solo `web` detrás de HTTPS.

Comandos útiles:

```bash
# Levantar en segundo plano
docker compose up -d --build

# Ver logs
docker compose logs -f web api dashboard

# Estado de salud
docker compose ps

# Bajar servicios
docker compose down

# Bajar servicios y borrar datos locales de PostgreSQL
docker compose down -v
```

Para VPS, publicar solo el servicio `web` detrás de HTTPS y configurar `CORS_ORIGIN`, `WS_CORS_ORIGIN`, `PWA_LOGIN_URL`, `POS_URL`, `SESSION_COOKIE_SECURE=true`, `POS_AUTH_COOKIE_SECURE=true` y `STRICT_ENV_VALIDATION=true` según el dominio real. Mantener `postgres/.env`, `api/.env` y `dashboard/.env` fuera de git.

### Backups automáticos de PostgreSQL

El stack incluye un servicio `backup` que ejecuta `docker/backup-db.sh` de forma periódica y deja dumps comprimidos en el volumen `postgres-backups` (conserva los últimos 7). El intervalo se controla con `BACKUP_INTERVAL_SECONDS` (default `86400`, es decir 24h).

```bash
# Cambiar frecuencia (ej: cada 6h) al levantar el stack
BACKUP_INTERVAL_SECONDS=21600 docker compose up -d

# Backup manual on-demand
docker compose exec postgres /scripts/backup-db.sh

# Restaurar el backup más reciente (o pasar un nombre de archivo)
docker compose exec postgres /scripts/restore-db.sh
```

### Versionado de assets de la PWA

La versión de assets (cache-busting del Service Worker) vive en un único lugar: `pwa/VERSION`. En cada release, editar ese número y sincronizarlo a `service-worker.js`, `src/app.js` e `index.html`:

```bash
node pwa/sync-version.mjs
```

### Escáner de código de barras en la PWA

El POS usa la API nativa `BarcodeDetector` cuando está disponible (Chrome/Edge). En navegadores sin soporte (ej: Safari en iOS) cae automáticamente a un decodificador ZXing (`pwa/src/vendor/zxing.min.js`) que se carga bajo demanda; si tampoco es posible, el cajero puede ingresar el código manualmente desde el buscador.

## Endurecimiento y seguridad

- El API valida secrets críticos cuando `STRICT_ENV_VALIDATION=true`.
- `JWT_SECRET`, `SECRET_KEY` y `APP_DATA_ENCRYPTION_KEY` deben ser reales y largos en VPS/producción.
- Los secretos sensibles del módulo SII no van en el frontend ni en `docker-compose.yml`; se guardan por tenant desde Configuración.
- El POS usa `sessionStorage` para el token del cajero y el dashboard usa sesión Flask.
- El endpoint `GET /tenant/config` quedó restringido a `dueno`.
- El certificado cargado por el dueño se guarda con permisos restringidos en el contenedor (`0600`).
- Las dependencias JS del dashboard se sirven localmente, sin depender de CDNs de terceros.

## Flujo productivo de boleta electrónica

Monay Market emite boletas desde el backend al registrar la venta en el POS. Si la integración SII está activa, la venta queda con estado `emitida`, `pendiente` o `error` según la respuesta del proveedor.

Para API Gateway eBoleta:

1. Crear una conexión en API Gateway y habilitar el producto Portal eBoleta.
2. Copiar el token de la conexión.
3. En Monay Market, entrar como dueño a Configuración → Módulo SII.
4. Seleccionar `API Gateway eBoleta`, cargar el token, RUT emisor, razón social, giro y clave tributaria SII.
5. Desactivar `Modo sandbox` para emitir contra el proveedor real.

La clave tributaria SII se guarda por tenant desde la pantalla de configuración y no se debe definir en `.env`. El POS muestra el folio/PDF oficial cuando la boleta queda emitida y permite imprimir el comprobante local desde el navegador.

### Proxy opcional para API Gateway

Si API Gateway debe salir por una IP propia para consultar SII, el repo incluye una base en `proxy-squid/`.

```bash
cd proxy-squid
docker compose up -d
```

Archivos del directorio:

- `proxy-squid/docker-compose.yml` → servicio proxy
- `proxy-squid/squid.conf` → reglas y dominios permitidos
- `proxy-squid/proxy.js` → apoyo local para pruebas

Luego se configura la URL del proxy directamente en la conexión de API Gateway, por ejemplo:

```text
http://usuario:password@IP_PUBLICA:3128
```

Esto no reemplaza al stack principal de Monay Market; es un componente opcional cuando el proveedor SII necesita salir por una IP dedicada.

## Variables de entorno

### PostgreSQL (`postgres/.env`)

| Variable | Descripción |
|----------|------------|
| `POSTGRES_DB` | Nombre de la base creada por el contenedor |
| `POSTGRES_USER` | Usuario dueño de la base |
| `POSTGRES_PASSWORD` | Contraseña del usuario de PostgreSQL |

### API (`api/.env`)

| Variable | Descripción |
|----------|------------|
| `DB_HOST` | Host de PostgreSQL |
| `DB_PORT` | Puerto de PostgreSQL (default: 5432) |
| `DB_USERNAME` | Usuario de PostgreSQL |
| `DB_PASSWORD` | Contraseña de PostgreSQL |
| `DB_DATABASE` | Nombre de la base de datos |
| `JWT_SECRET` | Secret para firmar tokens JWT |
| `APP_DATA_ENCRYPTION_KEY` | Clave para cifrar secretos sensibles persistidos (API keys, clave tributaria, contraseña del certificado) |
| `JWT_EXPIRATION` | Tiempo de expiración del JWT (ej: 1h) |
| `PORT` | Puerto del servidor (default: 3000) |
| `NODE_ENV` | Entorno (development / production) |
| `STRICT_ENV_VALIDATION` | Activa validación estricta de placeholders/secrets para VPS |
| `RUN_MIGRATIONS` | Ejecuta migraciones al iniciar el contenedor (default: `true`) |
| `CORS_ORIGIN` | Orígenes permitidos para HTTP API |
| `WS_CORS_ORIGIN` | Orígenes permitidos para WebSocket |
| `WS_REDIS_URL` | Opcional. URL de Redis para escalar WebSocket a múltiples réplicas (ej: `redis://redis:6379`). Vacío = adapter en memoria (una sola instancia) |
| `PWA_API_URL` | Override opcional expuesto a la PWA por `/runtime-config.js` |
| `PWA_LOGIN_URL` | Override opcional para logout/login central de la PWA |
| `LOGIN_RATE_LIMIT_*` | Ventana, intentos máximos y bloqueo del login |
| `SII_APIGATEWAY_BASE_URL` | URL base de API Gateway V2 (default: `https://app.apigateway.cl/api/v2`) |
| `BARCODE_LOOKUP_*` | Overrides opcionales para las URLs de lookup de código de barras |
| `SEED_DEMO_DATA` | Crea datos demo solo si está en `true`; mantener `false` en producción |
| `SEED_PASSWORD` | Contraseña inicial para usuarios demo solo cuando `SEED_DEMO_DATA=true` |

### Dashboard (`dashboard/.env`)

| Variable | Descripción |
|----------|------------|
| `API_URL` | URL interna del backend API dentro de Docker (ej: `http://api:3000`) |
| `PUBLIC_APP_URL` | URL pública del acceso unificado (ej: `http://localhost:8080`) |
| `LOGIN_URL` | URL opcional de retorno al login central cuando el cajero cierra sesión |
| `POS_URL` | Ruta o URL del POS para usuarios cajeros (default: `/pos/`) |
| `POS_AUTH_COOKIE_SECURE` | Usar `true` cuando el acceso esté servido por HTTPS |
| `SECRET_KEY` | Secret para sesiones Flask |
| `SESSION_COOKIE_SECURE` | Usar `true` cuando el dashboard esté servido por HTTPS |
| `SESSION_COOKIE_SAMESITE` | Política SameSite de sesión Flask |
| `SESSION_LIFETIME_SECONDS` | Duración de la sesión de dueño |
| `MAX_CONTENT_LENGTH` | Tamaño máximo de uploads recibidos por Flask |
| `STRICT_ENV_VALIDATION` | Activa validación estricta de secrets para VPS/producción |

## Endpoints disponibles

```
# Runtime / health
GET    /health                        → Healthcheck simple del API
GET    /runtime-config.js             → Configuración pública consumida por la PWA

# Autenticación
POST   /auth/login                    → Login con email + contraseña
POST   /auth/refresh                  → Renovar token JWT (requiere token)

# Usuarios (solo dueño)
GET    /users                         → Listar cajeros del tenant
POST   /users                         → Crear cajero
PATCH  /users/:id                     → Activar/desactivar cajero

# Productos
GET    /products                      → Listar productos (filtros: ?name=, ?category_id=, ?barcode=)
GET    /products/categories           → Listar categorías del tenant
GET    /products/:id                  → Obtener producto por ID
GET    /products/lookup-barcode/:code → Consultar barcode (Open Food Facts → UPCItemDB → Open Beauty Facts)
GET    /products/import-template      → Descargar plantilla Excel para importación
POST   /products                      → Crear producto (dueño)
PATCH  /products/:id                  → Editar producto (dueño)
DELETE /products/:id                  → Soft-delete producto (dueño, sin ventas recientes)
POST   /products/import-excel         → Importar productos desde Excel (dueño)

# Configuración del tenant
GET    /tenant/config                 → Ver configuración
PATCH  /tenant/config/sii             → Configurar módulo SII (dueño)
PATCH  /tenant/config/printer         → Configurar impresora (dueño)
GET    /tenant/subscription           → Ver estado de suscripción (dueño)

# Carrito
POST   /cart/validate                 → Validar carrito (stock, subtotales, total)

# Ventas
POST   /sales                         → Registrar venta (efectivo o tarjeta)
GET    /sales                         → Listar ventas (filtros: ?date_from=, ?date_to=, ?boleta_status=)
GET    /sales/:id                     → Detalle de venta con líneas y boleta
POST   /sales/close-register          → Cierre de caja: resumen del día
POST   /sales/:id/retry-boleta        → Reintentar emisión de boleta SII
GET    /sales/:id/receipt             → Obtener comprobante visual de una venta

# Dashboard (plan Pro, solo dueño)
GET    /dashboard/today               → Total y cantidad de ventas del día
GET    /dashboard/monthly             → Acumulado mensual con variación %
GET    /dashboard/daily-chart         → Gráfico de ventas diarias (?month=YYYY-MM)
GET    /dashboard/critical-stock      → Productos con stock crítico (todos los planes)
GET    /dashboard/inventory-value     → Valorización total del inventario

# Mermas (solo dueño)
POST   /mermas                        → Registrar pérdida de inventario
GET    /mermas                        → Listar mermas del tenant
GET    /mermas/stats                  → Estadísticas de mermas por período (?month=YYYY-MM)
```

## Datos de prueba (seed)

| Usuario | Email | Contraseña | Rol |
|---------|-------|-----------|-----|
| Dueño | dueno@example.com | `SEED_PASSWORD` si `SEED_DEMO_DATA=true` | dueno |
| Cajero | cajero@example.com | `SEED_PASSWORD` si `SEED_DEMO_DATA=true` | cajero |

Tenant: "Almacén Don Pedro" (RUT 76.123.456-7) con 10 categorías y 42 productos chilenos reales (Coca-Cola, Fruna, Nestlé, Colún, Lays, etc.) con precios estimados de almacén en CLP.

## Migraciones

El proyecto incluye migraciones TypeORM para manejar cambios en el esquema de base de datos:

```bash
# Ejecutar migraciones pendientes
npm run migration:run

# Revertir la última migración
npm run migration:revert

# Generar nueva migración (después de cambios en entidades)
npm run migration:generate -- -n NombreMigracion
```

### Migración importante: Productos a granel
La migración `1775941896491-AddIsWeighedToProducts.ts`:
- Agrega columna `is_weighed` (boolean) a productos
- Convierte `stock`, `critical_stock` y `sale_lines.quantity` de `integer` a `numeric(10,3)`
- Permite manejar productos a granel con 3 decimales de precisión
- Mantiene compatibilidad con productos unitarios existentes

## Desarrollo

### Estructura de módulos
- **API**: NestJS con TypeScript, TypeORM, PostgreSQL
- **Dashboard**: Flask con HTMX para interacciones sin JavaScript pesado
- **PWA**: Vanilla JavaScript con Service Worker para funcionamiento offline

### Pruebas
```bash
# Ejecutar tests unitarios
cd api && npm test

# Ejecutar tests con coverage
cd api && npm run test:cov
```

### Despliegue
1. Publicar `web` como entrada única del dominio con HTTPS.
2. Mantener `api`, `dashboard` y `postgres` solo en la red interna de Docker.
3. Ejecutar migraciones como paso controlado de release si se escala a más de una réplica.
4. Mantener `SEED_DEMO_DATA=false` en producción y crear usuarios reales desde un flujo controlado.
5. Para escalar WebSockets a múltiples réplicas, agregar un adapter compartido como Redis.
6. Si se opera con API Gateway + SII en producción, evaluar proxy dedicado por cliente/empresa para aislar IP y disponibilidad.
