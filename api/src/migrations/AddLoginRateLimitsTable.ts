import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLoginRateLimitsTable1760000000000 implements MigrationInterface {
  name = 'AddLoginRateLimitsTable1760000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "market"."login_rate_limits" (
        "key" varchar(320) PRIMARY KEY,
        "attempts" integer NOT NULL DEFAULT 0,
        "reset_at" TIMESTAMPTZ NOT NULL,
        "blocked_until" TIMESTAMPTZ NULL,
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS "market"."login_rate_limits"
    `);
  }
}
