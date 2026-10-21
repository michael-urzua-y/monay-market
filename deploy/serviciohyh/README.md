# Monay en el VPS de serviciohyh.cl (pos.serviciohyh.cl)

Instancia de **prueba** en el VPS donde corre el sitio `taller` (serviciohyh.cl). Se monta sin tocar ese sitio:
solo usa su carpeta (`/opt/monay`), un archivo propio en el nginx existente (`pos.conf`) y un registro DNS.

| Pieza                | Dónde                                      |
| -------------------- | ------------------------------------------ |
| Código y `.env`      | `/opt/monay`                               |
| Contenedores         | `monay-postgres`, `monay-api`, `monay-dashboard`, `monay-web`, `monay-backup` |
| Entrada web          | `/opt/taller/nginx/conf.d/pos.conf` → `monay-web` |
| Memoria aproximada   | ~250 MB                                     |

## 1. DNS en Cloudflare

Registro `A` · nombre `pos` · IPv4 `198.89.96.183` · proxy activado (nube naranja). El certificado de origen
actual ya cubre `*.serviciohyh.cl`.

## 2. Instalar (en el VPS)

```bash
git clone https://github.com/michael-urzua-y/monay-market.git /opt/monay
cd /opt/monay
git checkout feat/impresion-bluetooth-directa     # o main, cuando esté fusionado

sh deploy/serviciohyh/crear-env.sh                # crea los .env con claves aleatorias
docker compose -f deploy/serviciohyh/docker-compose.yml up -d --build
docker compose -f deploy/serviciohyh/docker-compose.yml ps        # todos "healthy"
```

`crear-env.sh` muestra **una sola vez** la clave del superadmin `michael`.

## 3. Conectar al nginx existente (sin cortar el servicio)

```bash
cp /opt/monay/deploy/serviciohyh/pos.conf /opt/taller/nginx/conf.d/
docker exec hyh-nginx nginx -t && docker exec hyh-nginx nginx -s reload
```

Si `nginx -t` falla, no se recarga nada y el sitio sigue igual.

## 4. Probar la impresión Bluetooth

1. `https://pos.serviciohyh.cl/login` → `michael` → crear un negocio con su dueño y un cajero.
2. Como dueño: **Configuración → SII → Modo sandbox o pruebas** (boletas simuladas, no se envían al SII) y
   **Configuración → Impresora → activada**.
3. En el celular (Chrome Android), entrar como cajero → **🖨️ Impresora → Vincular** → ticket de prueba.
4. Hacer una venta en efectivo: la boleta sale directo, con timbre.

## Operación

```bash
cd /opt/monay
git pull && docker compose -f deploy/serviciohyh/docker-compose.yml up -d --build   # actualizar
docker compose -f deploy/serviciohyh/docker-compose.yml down                        # apagar (conserva datos)
docker compose -f deploy/serviciohyh/docker-compose.yml up -d                       # encender
```

Para quitarlo por completo: `down -v` (borra la base) y
`rm /opt/taller/nginx/conf.d/pos.conf && docker exec hyh-nginx nginx -t && docker exec hyh-nginx nginx -s reload`.

## Limitación conocida

Todas las peticiones llegan a la API con la IP del nginx del VPS, así que los límites de intentos de login y de
peticiones por IP se comparten entre todos los usuarios de esta instancia. Para pruebas con pocos usuarios no es
problema; en un servidor propio, la API debe recibir la IP real del cliente.
