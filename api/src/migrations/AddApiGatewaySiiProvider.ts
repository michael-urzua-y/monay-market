import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApiGatewaySiiProvider1778000000000 implements MigrationInterface {
  name = 'AddApiGatewaySiiProvider1778000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "market"."sii_provider_enum" ADD VALUE IF NOT EXISTS 'api_gateway';
    `);

    await queryRunner.query(`
      ALTER TABLE "market"."tenant_configs"
      ADD COLUMN IF NOT EXISTS "sii_clave_tributaria" VARCHAR(100);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL does not support dropping enum values directly.
    await queryRunner.query(`
      ALTER TABLE "market"."tenant_configs"
      DROP COLUMN IF EXISTS "sii_clave_tributaria";
    `);
  }
}
