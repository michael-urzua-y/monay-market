import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcrypt';

/**
 * Seed migration con datos de prueba para desarrollo local:
 * - 1 tenant de ejemplo
 * - 1 TenantConfig (SII y printer desactivados)
 * - 1 Subscription (plan básico, activa)
 * - 1 usuario dueño + 1 usuario cajero
 * - 3 categorías + 5 productos chilenos
 *
 * Todos los IDs se generan dinámicamente con uuid_generate_v4().
 * La contraseña de ambos usuarios se hashea en runtime con bcrypt.
 */
export class SeedDatosPrueba implements MigrationInterface {
  name = 'SeedDatosPrueba';

  private readonly SEED_PASSWORD = 'password123';
  private readonly BCRYPT_ROUNDS = 10;

  public async up(queryRunner: QueryRunner): Promise<void> {
    const passwordHash = await bcrypt.hash(this.SEED_PASSWORD, this.BCRYPT_ROUNDS);

    // Insertar tenant y capturar su ID generado
    const [tenant] = await queryRunner.query(
      `INSERT INTO "tenants" ("name", "rut") VALUES ($1, $2) RETURNING "id"`,
      ['Almacén Don Pedro', '76.123.456-7'],
    );
    const tenantId = tenant.id;

    // Insertar configuración del tenant
    await queryRunner.query(
      `INSERT INTO "tenant_configs" ("tenant_id", "sii_enabled", "sii_sandbox_mode", "printer_enabled")
       VALUES ($1, $2, $3, $4)`,
      [tenantId, false, true, false],
    );

    // Insertar suscripción (plan básico, activa, 1 año)
    await queryRunner.query(
      `INSERT INTO "subscriptions" ("tenant_id", "plan", "start_date", "end_date", "status")
       VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year', $3)`,
      [tenantId, 'basico', 'activa'],
    );

    // Insertar usuario dueño
    await queryRunner.query(
      `INSERT INTO "users" ("tenant_id", "email", "password_hash", "role", "active")
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, 'dueno@example.com', passwordHash, 'dueno', true],
    );

    // Insertar usuario cajero
    await queryRunner.query(
      `INSERT INTO "users" ("tenant_id", "email", "password_hash", "role", "active")
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, 'cajero@example.com', passwordHash, 'cajero', true],
    );

    // Insertar categorías y capturar IDs
    const [catBebidas] = await queryRunner.query(
      `INSERT INTO "categories" ("tenant_id", "name") VALUES ($1, $2) RETURNING "id"`,
      [tenantId, 'Bebidas'],
    );
    const [catSnacks] = await queryRunner.query(
      `INSERT INTO "categories" ("tenant_id", "name") VALUES ($1, $2) RETURNING "id"`,
      [tenantId, 'Snacks'],
    );
    const [catLimpieza] = await queryRunner.query(
      `INSERT INTO "categories" ("tenant_id", "name") VALUES ($1, $2) RETURNING "id"`,
      [tenantId, 'Limpieza'],
    );

    // Insertar productos con datos reales chilenos
    const productos = [
      { categoryId: catBebidas.id, name: 'Coca-Cola 1.5L', barcode: '7801610223123', price: 1490, stock: 48, criticalStock: 10 },
      { categoryId: catBebidas.id, name: 'Agua Mineral Cachantún 1L', barcode: '7801620003456', price: 690, stock: 60, criticalStock: 12 },
      { categoryId: catSnacks.id, name: 'Papas Fritas Lays Clásicas 150g', barcode: '7802215000789', price: 1290, stock: 30, criticalStock: 5 },
      { categoryId: catSnacks.id, name: 'Galletas Tritón 126g', barcode: '7802225001234', price: 590, stock: 25, criticalStock: 8 },
      { categoryId: catLimpieza.id, name: 'Detergente Omo 800g', barcode: '7801030005678', price: 3490, stock: 15, criticalStock: 3 },
    ];

    for (const p of productos) {
      await queryRunner.query(
        `INSERT INTO "products" ("tenant_id", "category_id", "name", "barcode", "price", "stock", "critical_stock", "active")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [tenantId, p.categoryId, p.name, p.barcode, p.price, p.stock, p.criticalStock, true],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Buscar el tenant por nombre para no depender de IDs hardcodeados
    const [tenant] = await queryRunner.query(
      `SELECT "id" FROM "tenants" WHERE "name" = $1 AND "rut" = $2`,
      ['Almacén Don Pedro', '76.123.456-7'],
    );

    if (tenant) {
      // Eliminar en orden inverso respetando foreign keys
      await queryRunner.query(`DELETE FROM "products" WHERE "tenant_id" = $1`, [tenant.id]);
      await queryRunner.query(`DELETE FROM "categories" WHERE "tenant_id" = $1`, [tenant.id]);
      await queryRunner.query(`DELETE FROM "users" WHERE "tenant_id" = $1`, [tenant.id]);
      await queryRunner.query(`DELETE FROM "subscriptions" WHERE "tenant_id" = $1`, [tenant.id]);
      await queryRunner.query(`DELETE FROM "tenant_configs" WHERE "tenant_id" = $1`, [tenant.id]);
      await queryRunner.query(`DELETE FROM "tenants" WHERE "id" = $1`, [tenant.id]);
    }
  }
}
