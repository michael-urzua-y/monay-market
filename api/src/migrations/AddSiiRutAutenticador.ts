import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSiiRutAutenticador1778100000000 implements MigrationInterface {
  name = 'AddSiiRutAutenticador1778100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "market"."tenant_configs"
      ADD COLUMN IF NOT EXISTS "sii_rut_autenticador" VARCHAR(20);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "market"."tenant_configs"
      DROP COLUMN IF EXISTS "sii_rut_autenticador";
    `);
  }
}
