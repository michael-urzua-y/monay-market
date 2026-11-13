import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Guarda la referencia del cobro con tarjeta hecho fuera de Monay (hoy,
 * SumUp Tap to Pay desde el celular). Permite enlazar cada venta con el
 * código de transacción que devuelve el proveedor de pago, para poder
 * cuadrarla después contra sus depósitos.
 */
export class AddCardTransactionRefToSales1782500000000 implements MigrationInterface {
  name = 'AddCardTransactionRefToSales1782500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "market"."sales"
      ADD COLUMN IF NOT EXISTS "card_transaction_ref" varchar(100)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "market"."sales"
      DROP COLUMN IF EXISTS "card_transaction_ref"
    `);
  }
}
