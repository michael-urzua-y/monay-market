import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSiiBusinessFields1776000000000 implements MigrationInterface {
  name = 'AddSiiBusinessFields1776000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "market"."sii_provider_enum" ADD VALUE IF NOT EXISTS 'simple_api';
    `);
    await queryRunner.query(`
      ALTER TYPE "market"."sii_provider_enum" ADD VALUE IF NOT EXISTS 'base_api';
    `);

    await queryRunner.query(`
      ALTER TABLE "market"."tenant_configs"
      ADD COLUMN IF NOT EXISTS "sii_razon_social" VARCHAR(200),
      ADD COLUMN IF NOT EXISTS "sii_giro" VARCHAR(200),
      ADD COLUMN IF NOT EXISTS "sii_certificado_path" VARCHAR(500),
      ADD COLUMN IF NOT EXISTS "sii_certificado_password" VARCHAR(100);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support dropping enum values directly.
    await queryRunner.query(`
      ALTER TABLE "market"."tenant_configs"
      DROP COLUMN IF EXISTS "sii_razon_social",
      DROP COLUMN IF EXISTS "sii_giro",
      DROP COLUMN IF EXISTS "sii_certificado_path",
      DROP COLUMN IF EXISTS "sii_certificado_password";
    `);
  }
}
