import { MigrationInterface, QueryRunner } from 'typeorm';
import { formatRut } from '../common/rut/rut';

/**
 * - Deja todos los RUT guardados con el mismo formato ("12.345.678-5"). Los que no son
 *   válidos no se tocan (se informan en el log para corregirlos desde el panel).
 * - El proveedor de boletas pasa a ser siempre API Gateway.
 * - La impresión de boleta queda siempre activa (ya no se configura desde el panel).
 */
export class NormalizeRutProviderPrinter1782300000000 implements MigrationInterface {
  name = 'NormalizeRutProviderPrinter1782300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.normalize(queryRunner, 'tenants', 'rut');
    await this.normalize(queryRunner, 'tenant_configs', 'sii_rut_emisor');
    await this.normalize(queryRunner, 'tenant_configs', 'sii_rut_autenticador');

    await queryRunner.query(`UPDATE "market"."tenant_configs" SET "sii_provider" = 'api_gateway'`);

    await queryRunner.query(`ALTER TABLE "market"."tenant_configs" ALTER COLUMN "printer_enabled" SET DEFAULT true`);
    await queryRunner.query(`UPDATE "market"."tenant_configs" SET "printer_enabled" = true`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // El formato de RUT y el proveedor no se revierten (no hay forma de saber el valor anterior).
    await queryRunner.query(`ALTER TABLE "market"."tenant_configs" ALTER COLUMN "printer_enabled" SET DEFAULT false`);
  }

  private async normalize(queryRunner: QueryRunner, table: string, column: string): Promise<void> {
    const rows: { id: string; value: string }[] = await queryRunner.query(
      `SELECT "id", "${column}" AS "value" FROM "market"."${table}" WHERE "${column}" IS NOT NULL AND "${column}" <> ''`,
    );
    for (const row of rows) {
      const formatted = formatRut(row.value);
      if (!formatted) {
        console.warn(`[migración] ${table}.${column} con RUT inválido (id ${row.id}): revisar en el panel`);
        continue;
      }
      if (formatted !== row.value) {
        await queryRunner.query(`UPDATE "market"."${table}" SET "${column}" = $1 WHERE "id" = $2`, [formatted, row.id]);
      }
    }
  }
}
