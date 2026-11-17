import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Credenciales de SumUp Tap to Pay por negocio. La app de la caja las pide
 * al servidor para cobrar con tarjeta en el celular. Las claves se guardan
 * cifradas (encryptedStringTransformer), por eso el largo de 512.
 */
export class AddSumupCardPaymentConfig1782600000000 implements MigrationInterface {
  name = 'AddSumupCardPaymentConfig1782600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "market"."tenant_configs"
      ADD COLUMN IF NOT EXISTS "card_payment_enabled" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "sumup_api_key" varchar(512),
      ADD COLUMN IF NOT EXISTS "sumup_affiliate_key" varchar(512)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "market"."tenant_configs"
      DROP COLUMN IF EXISTS "sumup_affiliate_key",
      DROP COLUMN IF EXISTS "sumup_api_key",
      DROP COLUMN IF EXISTS "card_payment_enabled"
    `);
  }
}
