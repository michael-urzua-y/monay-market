import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPerformanceIndexes1782000000000 implements MigrationInterface {
    name = 'AddPerformanceIndexes1782000000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Products: tenant + active (most common query filter)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_products_tenant_active"
            ON "market"."products" ("tenant_id", "active")
        `);

        // Products: tenant + barcode + active (barcode lookup and uniqueness checks)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_products_tenant_barcode_active"
            ON "market"."products" ("tenant_id", "barcode", "active")
            WHERE "barcode" IS NOT NULL
        `);

        // Sales: tenant + created_at (sales listing with date filters)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_sales_tenant_created"
            ON "market"."sales" ("tenant_id", "created_at" DESC)
        `);

        // Sales: tenant + user + created_at (cashier's own sales)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_sales_tenant_user_created"
            ON "market"."sales" ("tenant_id", "user_id", "created_at" DESC)
        `);

        // Sales: client_sale_id for idempotency lookups
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_sales_tenant_client_sale_id"
            ON "market"."sales" ("tenant_id", "client_sale_id")
            WHERE "client_sale_id" IS NOT NULL
        `);

        // Sale lines: product_id (for recent sales check on delete)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_sale_lines_product"
            ON "market"."sale_lines" ("product_id")
        `);

        // Categories: tenant + name (sorted listing)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_categories_tenant_name"
            ON "market"."categories" ("tenant_id", "name")
        `);

        // Users: tenant + username (login lookup)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_users_tenant_username"
            ON "market"."users" ("tenant_id", LOWER("username"))
        `);

        // Arqueos: tenant + created_at
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_arqueos_tenant_created"
            ON "market"."arqueos" ("tenant_id", "created_at" DESC)
        `);

        // Login rate limits: key (throttle lookups)
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_login_rate_limits_key"
            ON "market"."login_rate_limits" ("key")
        `);

        // Price history: product + date
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_price_history_product_date"
            ON "market"."price_history" ("product_id", "changed_at" DESC)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "market"."IDX_price_history_product_date"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "market"."IDX_login_rate_limits_key"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "market"."IDX_arqueos_tenant_created"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "market"."IDX_users_tenant_username"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "market"."IDX_categories_tenant_name"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "market"."IDX_sale_lines_product"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "market"."IDX_sales_tenant_client_sale_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "market"."IDX_sales_tenant_user_created"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "market"."IDX_sales_tenant_created"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "market"."IDX_products_tenant_barcode_active"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "market"."IDX_products_tenant_active"`);
    }
}
