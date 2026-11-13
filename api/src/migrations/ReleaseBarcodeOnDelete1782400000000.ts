import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El índice único sobre (tenant_id, barcode) bloqueaba reutilizar un código
 * de barras aunque el producto que lo tenía ya estuviera eliminado
 * (soft-delete, active = false). Lo reemplazamos por un índice único parcial
 * que solo aplica a productos activos: un producto eliminado libera su
 * código de barras para que se pueda volver a usar.
 */
export class ReleaseBarcodeOnDelete1782400000000 implements MigrationInterface {
  name = 'ReleaseBarcodeOnDelete1782400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "market"."IDX_product_tenant_barcode"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_product_tenant_barcode_unique_active"
      ON "market"."products" ("tenant_id", "barcode")
      WHERE "active" = true AND "barcode" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "market"."IDX_product_tenant_barcode_unique_active"
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_product_tenant_barcode"
      ON "market"."products" ("tenant_id", "barcode")
    `);
  }
}
