import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropCashierBreadPermission1780000000000 implements MigrationInterface {
  name = 'DropCashierBreadPermission1780000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "market"."users"
      DROP COLUMN IF EXISTS "allow_bread_reception"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "market"."users"
      ADD COLUMN IF NOT EXISTS "allow_bread_reception" boolean NOT NULL DEFAULT false
    `);
  }
}
