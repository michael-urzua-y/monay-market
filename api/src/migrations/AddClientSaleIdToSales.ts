import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClientSaleIdToSales1776000000001 implements MigrationInterface {
  name = 'AddClientSaleIdToSales1776000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "market"."sales"
      ADD COLUMN IF NOT EXISTS "client_sale_id" VARCHAR(100);
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_sale_tenant_client_sale_id"
      ON "market"."sales" ("tenant_id", "client_sale_id")
      WHERE "client_sale_id" IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "market"."IDX_sale_tenant_client_sale_id";
    `);
    await queryRunner.query(`
      ALTER TABLE "market"."sales"
      DROP COLUMN IF EXISTS "client_sale_id";
    `);
  }
}
