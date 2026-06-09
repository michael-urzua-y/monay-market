import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSiiCodigoSucursal1778200000000 implements MigrationInterface {
  name = 'AddSiiCodigoSucursal1778200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "market"."tenant_configs"
      ADD COLUMN IF NOT EXISTS "sii_codigo_sucursal" integer;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "market"."tenant_configs"
      DROP COLUMN IF EXISTS "sii_codigo_sucursal";
    `);
  }
}
