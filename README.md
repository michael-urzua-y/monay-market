# Monay Market

Sistema SaaS de punto de venta (POS) y gestión de inventario para almacenes de barrio y minimarkets en Chile.

## Arquitectura

```
monay-market/
├── api/               → Backend NestJS + TypeScript
├── dashboard/         → Panel Admin Flask + HTMX (próximamente)
├── pwa/               → PWA Punto de Venta (próximamente)
└── README.md
```

## Stack Tecnológico

| Componente | Tecnología |
|------------|-----------|
| Backend API | NestJS + TypeScript |
| Base de datos | PostgreSQL (local) |
| ORM | TypeORM |
| Autenticación | JWT + Passport + bcrypt |
| Panel Admin | Flask + Jinja2 + HTMX + Alpine.js (próximamente) |
| POS | PWA con JavaScript vanilla (próximamente) |
| Testing | Jest + fast-check (property-based testing) |

## Características implementadas

- Multi-tenant con aislamiento por `tenant_id` en todas las tablas (esquema `market`)
- Autenticación JWT con roles diferenciados (dueño / cajero)
- Guards: JwtAuth, Tenant, Roles, Subscription, Plan
- Gestión de usuarios cajeros (CRUD, solo dueño)
- Configuración de tenant: módulo SII y impresora térmica
- Control de suscripción: planes Básico y Pro
- CRUD de productos con soft-delete y validación de ventas recientes
- Lookup de código de barras via Open Food Facts: escanea el barcode y autocompleta nombre + categoría, el admin solo pone precio y stock
- Importación masiva de productos desde Excel (.xlsx)
- 9 entidades con relaciones, índices compuestos y enums
- Migraciones y seed con 41 productos chilenos reales
- 111 tests unitarios pasando

## Base de datos

Todas las tablas de negocio viven en el esquema `market` (la tabla de migraciones queda en `public`).

| Tabla | Descripción | Datos seed |
|-------|------------|-----------|
| `tenants` | Tiendas/clientes del sistema. Cada tenant es un almacén independiente con sus propios datos aislados | 1 tenant |
| `tenant_configs` | Configuración por tenant: módulo SII (activar/desactivar, credenciales proveedor) e impresora térmica | 1 config |
| `subscriptions` | Plan de suscripción del tenant (Básico o Pro), fechas de vigencia y estado | 1 suscripción |
| `users` | Usuarios del sistema con roles dueño (administrador) o cajero (operador POS). Contraseñas hasheadas con bcrypt | 2 usuarios |
| `categories` | Categorías de productos por tenant (Bebidas, Snacks, Lácteos, etc.) | 7 categorías |
| `products` | Catálogo de productos con nombre, código de barras, precio CLP, stock y umbral de stock crítico | 41 productos |
| `sales` | Ventas registradas con total, método de pago (efectivo/tarjeta), monto recibido, vuelto y estado de boleta SII | vacía (se llena al vender) |
| `sale_lines` | Líneas de detalle de cada venta: producto, cantidad, precio unitario y subtotal (snapshot al momento de la venta) | vacía |
| `boletas` | Boletas electrónicas emitidas ante el SII: folio, timbre electrónico, PDF y proveedor | vacía |

## Requisitos

- Node.js >= 18
- PostgreSQL >= 14

## Setup local

```bash
# Clonar el repo
git clone https://github.com/michael-urzua-y/monay-market.git
cd monay-market

# Instalar dependencias del API
cd api
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales de PostgreSQL local

# Crear la base de datos
createdb monay_market

# Ejecutar migraciones
npm run migration:run

# Ejecutar tests
npm test

# Iniciar en modo desarrollo
npm run start:dev
```

## Variables de entorno

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
GET    /products/:id                  → Obtener producto por ID
GET    /products/lookup-barcode/:code → Consultar Open Food Facts por código de barras
POST   /products                      → Crear producto (dueño)
PATCH  /products/:id                  → Editar producto (dueño)
DELETE /products/:id                  → Soft-delete producto (dueño, sin ventas recientes)
POST   /products/import-excel         → Importar productos desde Excel (dueño)

# Configuración del tenant
GET    /tenant/config                 → Ver configuración
PATCH  /tenant/config/sii             → Configurar módulo SII (dueño)
PATCH  /tenant/config/printer         → Configurar impresora (dueño)
GET    /tenant/subscription           → Ver estado de suscripción (dueño)
```

## Datos de prueba (seed)

| Usuario | Email | Contraseña | Rol |
|---------|-------|-----------|-----|
| Dueño | dueno@example.com | password123 | dueno |
| Cajero | cajero@example.com | password123 | cajero |

Tenant: "Almacén Don Pedro" (RUT 76.123.456-7) con 7 categorías y 41 productos chilenos reales (Coca-Cola, Fruna, Nestlé, Colún, Lays, etc.) con precios estimados de almacén en CLP.
