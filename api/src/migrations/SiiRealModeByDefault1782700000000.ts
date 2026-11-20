import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Los negocios nuevos emiten boletas reales: el modo pruebas (boletas
 * simuladas, sin llamar a API Gateway) queda apagado por defecto. Los
 * negocios existentes no cambian; el superadmin lo apaga en su ficha.
 */
export class SiiRealModeByDefault1782700000000 implements MigrationInterface {
  name = 'SiiRealModeByDefault1782700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "market"."tenant_configs"
      ALTER COLUMN "sii_sandbox_mode" SET DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "market"."tenant_configs"
      ALTER COLUMN "sii_sandbox_mode" SET DEFAULT true
    `);
  }
}
