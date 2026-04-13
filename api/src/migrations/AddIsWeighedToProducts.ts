import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsWeighedToProducts1775941896491 implements MigrationInterface {
    name = 'AddIsWeighedToProducts1775941896491'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "market"."IDX_product_tenant_active_stock"`);
        
        await queryRunner.query(`ALTER TABLE "market"."products" ADD "is_weighed" boolean NOT NULL DEFAULT false`);
        
        await queryRunner.query(`ALTER TABLE "market"."sale_lines" ALTER COLUMN "quantity" TYPE numeric(10,3) USING "quantity"::numeric(10,3)`);
        await queryRunner.query(`ALTER TABLE "market"."products" ALTER COLUMN "stock" TYPE numeric(10,3) USING "stock"::numeric(10,3)`);
        await queryRunner.query(`ALTER TABLE "market"."products" ALTER COLUMN "critical_stock" TYPE numeric(10,3) USING "critical_stock"::numeric(10,3)`);
        
        await queryRunner.query(`CREATE INDEX "IDX_product_tenant_active_stock" ON "market"."products" ("tenant_id", "active", "stock") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "market"."IDX_product_tenant_active_stock"`);
        
        await queryRunner.query(`ALTER TABLE "market"."products" ALTER COLUMN "critical_stock" TYPE integer USING ROUND("critical_stock")::integer`);
        await queryRunner.query(`ALTER TABLE "market"."products" ALTER COLUMN "stock" TYPE integer USING ROUND("stock")::integer`);
        await queryRunner.query(`ALTER TABLE "market"."sale_lines" ALTER COLUMN "quantity" TYPE integer USING ROUND("quantity")::integer`);
        await queryRunner.query(`ALTER TABLE "market"."products" DROP COLUMN "is_weighed"`);
        
        await queryRunner.query(`CREATE INDEX "IDX_product_tenant_active_stock" ON "market"."products" ("tenant_id", "active", "stock") `);
    }

}
