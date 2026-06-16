import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductStockModesAndReceptions1779800000000 implements MigrationInterface {
  name = 'AddProductStockModesAndReceptions1779800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "market"."products"
      ADD COLUMN IF NOT EXISTS "tracks_stock" boolean NOT NULL DEFAULT true
    `);

    await queryRunner.query(`
      ALTER TABLE "market"."products"
      ADD COLUMN IF NOT EXISTS "allow_cashier_reception" boolean NOT NULL DEFAULT false
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "market"."product_receptions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "quantity" numeric(10,3) NOT NULL,
        "note" varchar(500),
        "tracked_in_stock" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_product_receptions_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_product_receptions_tenant" FOREIGN KEY ("tenant_id") REFERENCES "market"."tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_receptions_product" FOREIGN KEY ("product_id") REFERENCES "market"."products"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_product_receptions_user" FOREIGN KEY ("user_id") REFERENCES "market"."users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_product_reception_tenant_created_at"
      ON "market"."product_receptions" ("tenant_id", "created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "market"."IDX_product_reception_tenant_created_at"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "market"."product_receptions"
    `);
    await queryRunner.query(`
      ALTER TABLE "market"."products"
      DROP COLUMN IF EXISTS "allow_cashier_reception"
    `);
    await queryRunner.query(`
      ALTER TABLE "market"."products"
      DROP COLUMN IF EXISTS "tracks_stock"
    `);
  }
}
