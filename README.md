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

- Multi-tenant con aislamiento por `tenant_id` en todas las tablas
- Autenticación JWT con roles diferenciados (dueño / cajero)
- Guards: JwtAuth, Tenant, Roles, Subscription, Plan
- Gestión de usuarios cajeros (CRUD, solo dueño)
- Configuración de tenant: módulo SII y impresora térmica
- Control de suscripción: planes Básico y Pro
- 9 entidades con relaciones, índices compuestos y enums
- Migraciones y seed de datos de prueba
- 78 tests unitarios pasando

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
POST   /auth/login              → Login con email + contraseña
POST   /auth/refresh            → Renovar token JWT

GET    /users                   → Listar cajeros (dueño)
POST   /users                   → Crear cajero (dueño)
PATCH  /users/:id               → Activar/desactivar cajero (dueño)

GET    /tenant/config           → Ver configuración del tenant
PATCH  /tenant/config/sii       → Configurar módulo SII (dueño)
PATCH  /tenant/config/printer   → Configurar impresora (dueño)
GET    /tenant/subscription     → Ver estado de suscripción (dueño)
```

## Datos de prueba (seed)

| Usuario | Email | Contraseña | Rol |
|---------|-------|-----------|-----|
| Dueño | dueno@example.com | password123 | dueno |
| Cajero | cajero@example.com | password123 | cajero |

Tenant: "Almacén Don Pedro" (RUT 76.123.456-7) con 3 categorías y 5 productos chilenos.
