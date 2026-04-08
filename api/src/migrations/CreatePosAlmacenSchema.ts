import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePosAlmacenSchema implements MigrationInterface {
  name = 'CreatePosAlmacenSchema';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable uuid-ossp extension (needed for uuid_generate_v4)
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Create enum types
    await queryRunner.query(`
      CREATE TYPE "subscription_plan_enum" AS ENUM ('basico', 'pro')
    `);
    await queryRunner.query(`
      CREATE TYPE "subscription_status_enum" AS ENUM ('activa', 'expirada', 'cancelada')
    `);
    await queryRunner.query(`
      CREATE TYPE "user_role_enum" AS ENUM ('dueno', 'cajero')
    `);
    await queryRunner.query(`
      CREATE TYPE "payment_method_enum" AS ENUM ('efectivo', 'tarjeta')
    `);
    await queryRunner.query(`
      CREATE TYPE "boleta_status_enum" AS ENUM ('no_aplica', 'emitida', 'pendiente', 'error')
    `);
    await queryRunner.query(`
      CREATE TYPE "sii_provider_enum" AS ENUM ('haulmer', 'openfactura', 'facturacion_cl')
    `);

    // Create tenants table
    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(255) NOT NULL,
        "rut" varchar(20) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenants" PRIMARY KEY ("id")
      )
    `);

    // Create tenant_configs table
    await queryRunner.query(`
      CREATE TABLE "tenant_configs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "sii_enabled" boolean NOT NULL DEFAULT false,
        "sii_provider" "sii_provider_enum",
        "sii_api_key" varchar(512),
        "sii_rut_emisor" varchar(20),
        "sii_sandbox_mode" boolean NOT NULL DEFAULT true,
        "printer_enabled" boolean NOT NULL DEFAULT false,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenant_configs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_tenant_configs_tenant_id" UNIQUE ("tenant_id"),
        CONSTRAINT "FK_tenant_configs_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    // Create subscriptions table
    await queryRunner.query(`
      CREATE TABLE "subscriptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "plan" "subscription_plan_enum" NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "status" "subscription_status_enum" NOT NULL,
        CONSTRAINT "PK_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_subscriptions_tenant_id" UNIQUE ("tenant_id"),
        CONSTRAINT "FK_subscriptions_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    // Create users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "email" varchar(255) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "role" "user_role_enum" NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "FK_users_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    // Create categories table
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "name" varchar(255) NOT NULL,
        CONSTRAINT "PK_categories" PRIMARY KEY ("id"),
        CONSTRAINT "FK_categories_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    // Create products table
    await queryRunner.query(`
      CREATE TABLE "products" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "category_id" uuid,
        "name" varchar(255) NOT NULL,
        "barcode" varchar(100),
        "price" integer NOT NULL,
        "stock" integer NOT NULL DEFAULT 0,
        "critical_stock" integer NOT NULL DEFAULT 0,
        "active" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_products" PRIMARY KEY ("id"),
        CONSTRAINT "FK_products_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_products_category" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL
      )
    `);

    // Create sales table
    await queryRunner.query(`
      CREATE TABLE "sales" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "total" integer NOT NULL,
        "payment_method" "payment_method_enum" NOT NULL,
        "amount_received" integer,
        "change_amount" integer,
        "boleta_status" "boleta_status_enum" NOT NULL DEFAULT 'no_aplica',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sales" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sales_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sales_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create sale_lines table
    await queryRunner.query(`
      CREATE TABLE "sale_lines" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sale_id" uuid NOT NULL,
        "product_id" uuid NOT NULL,
        "product_name" varchar(255) NOT NULL,
        "unit_price" integer NOT NULL,
        "quantity" integer NOT NULL,
        "subtotal" integer NOT NULL,
        CONSTRAINT "PK_sale_lines" PRIMARY KEY ("id"),
        CONSTRAINT "FK_sale_lines_sale" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sale_lines_product" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE
      )
    `);

    // Create boletas table
    await queryRunner.query(`
      CREATE TABLE "boletas" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "sale_id" uuid NOT NULL,
        "tenant_id" uuid NOT NULL,
        "folio" varchar(100) NOT NULL,
        "timbre_electronico" text NOT NULL,
        "pdf_url" varchar(512),
        "provider" "sii_provider_enum" NOT NULL,
        "emitted_at" TIMESTAMP NOT NULL,
        CONSTRAINT "PK_boletas" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_boletas_sale_id" UNIQUE ("sale_id"),
        CONSTRAINT "FK_boletas_sale" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_boletas_tenant" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
      )
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_product_tenant_barcode" ON "products" ("tenant_id", "barcode")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_product_tenant_active_stock" ON "products" ("tenant_id", "active", "stock")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_sale_tenant_created_at" ON "sales" ("tenant_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_sale_tenant_boleta_status" ON "sales" ("tenant_id", "boleta_status")
    `);

  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sale_tenant_boleta_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_sale_tenant_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_tenant_active_stock"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_product_tenant_barcode"`);

    // Drop tables in reverse order of creation (respecting foreign keys)
    await queryRunner.query(`DROP TABLE IF EXISTS "boletas"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sale_lines"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "sales"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "products"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "categories"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "subscriptions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_configs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenants"`);

    // Drop enum types
    await queryRunner.query(`DROP TYPE IF EXISTS "sii_provider_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "boleta_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payment_method_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_role_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "subscription_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "subscription_plan_enum"`);
  }
}
