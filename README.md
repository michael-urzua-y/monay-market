# Monay Market

Sistema SaaS de punto de venta (POS) y gestión de inventario para almacenes de barrio y minimarkets en Chile.

## Arquitectura

```
monay-market/
├── api/               → Backend NestJS + TypeScript
├── dashboard/         → Panel Admin Flask + HTMX + Alpine.js
├── pwa/               → PWA Punto de Venta (vanilla JS)
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
- Guards: JwtAuth, Tenant, Roles, Subscription, Plan
- Gestión de usuarios cajeros (CRUD, solo dueño)
- Configuración de tenant: módulo SII y impresora térmica
- Control de suscripción: planes Básico y Pro
- CRUD de productos con soft-delete, validación de ventas recientes e indicador de venta a granel (`is_weighed`)
- Soporte para productos a granel con control de stock y cantidades en decimales de alta precisión (numeric(10,3) en PostgreSQL)
- Migración automática para convertir stock entero a decimal con 3 decimales
- Lookup de código de barras multi-fuente: Open Food Facts → UPCItemDB → Open Beauty Facts (con fallback encadenado)
- Importación masiva de productos desde Excel (.xlsx) con validación de formato
- Descarga de plantilla Excel oficial para importación
- Validación server-side del carrito (stock, subtotales, total)
- Registro de ventas con transacción atómica y SELECT ... FOR UPDATE
- Pago efectivo (cálculo de vuelto) y tarjeta
- Deducción de stock atómica (unidades y fracciones) con alertas de stock crítico
- Cierre de caja: resumen diario desglosado y registro de cuadratura (arqueo)
- Módulo SII opcional: emisión de boleta electrónica con reintentos (3 intentos, 15s timeout), soporte Haulmer/OpenFactura/Facturación.cl/SimpleAPI/BaseAPI, IVA 19%
- Reintento manual de boletas pendientes
- Dashboard de métricas: ventas del día, acumulado mensual con variación %, gráfico diario con selector de mes, stock crítico, valorización inventario (plan Pro)
- Comprobante visual estructurado con datos de tienda, productos, pago y boleta
- WebSocket Gateway con autenticación JWT: eventos sale:created, stock:updated, stock:critical filtrados por tenant
- Módulo de mermas: registro de pérdidas de inventario por causas (vencido, roto, robo, consumo interno), estadísticas mensuales

### Panel Admin (Flask + HTMX)
- Login con JWT almacenado en sesión Flask
- Dashboard con métricas auto-refresh vía HTMX: ventas del día, acumulado mensual, valorización inventario, gráfico diario (Chart.js), productos con stock crítico (paginado)
- Gestión de productos: CRUD completo con soporte inteligente para productos a granel (decimales), búsqueda en tiempo real con HTMX, paginación server-side, barcode lookup con autocompletado, escáner de cámara
- Asistente Inteligente de Compras: generación automática de lista de reposición optimizada para móviles, calculando faltantes y agrupada por categorías
- Ventas: listado con filtros por fecha (desde/hasta) y estado de boleta, paginación, detalle de venta, reintento de boletas pendientes
- Usuarios: gestión de cajeros (crear, activar/desactivar)
- Configuración: módulo SII (proveedor, credenciales, sandbox), impresora térmica, estado de suscripción
- Mermas: registro de pérdidas de inventario (causa, cantidad, valor), estadísticas mensuales, paginación

### PWA Punto de Venta
- Instalable en celular como app nativa (manifest.json + íconos PWA 192x192 y 512x512)
- Service Worker: cache-first para assets, network-first para API, respuesta offline 503
- Login con JWT almacenado en localStorage
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

## Variables de entorno

### API (`api/.env`)

| Variable | Descripción |
|----------|------------|
| `DB_HOST` | Host de PostgreSQL |
| `DB_PORT` | Puerto de PostgreSQL (default: 5432) |
| `DB_USERNAME` | Usuario de PostgreSQL |
| `DB_PASSWORD` | Contraseña de PostgreSQL |
| `DB_DATABASE` | Nombre de la base de datos |
| `JWT_SECRET` | Secret para firmar tokens JWT |
| `JWT_EXPIRATION` | Tiempo de expiración del JWT (ej: 1h) |
| `PORT` | Puerto del servidor (default: 3000) |
| `NODE_ENV` | Entorno (development / production) |

### Dashboard (`dashboard/.env`)

| Variable | Descripción |
|----------|------------|
| `API_URL` | URL del backend API (ej: http://localhost:3000) |
| `SECRET_KEY` | Secret para sesiones Flask |

## Endpoints disponibles

```
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
| Dueño | dueno@example.com | password123 | dueno |
| Cajero | cajero@example.com | password123 | cajero |

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
1. **API**: Desplegar en servidor Node.js (PM2, Docker, etc.)
2. **Dashboard**: Desplegar con Gunicorn + Nginx
3. **PWA**: Servir archivos estáticos desde CDN o servidor web
4. **Base de datos**: PostgreSQL con réplica para producción