import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePriceHistoryTable1776000000001 implements MigrationInterface {
  name = 'CreatePriceHistoryTable1776000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "market"."price_history" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" uuid NOT NULL,
        "old_price" integer NOT NULL,
        "new_price" integer NOT NULL,
        "changed_by" uuid,
        "changed_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_price_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_price_history_product" FOREIGN KEY ("product_id") REFERENCES "market"."products"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_price_history_product_date" ON "market"."price_history" ("product_id", "changed_at" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "market"."IDX_price_history_product_date"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "market"."price_history"`);
  }
}
