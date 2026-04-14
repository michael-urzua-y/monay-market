import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateMermasTable1713100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'market.mermas',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'tenant_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'product_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'quantity',
            type: 'numeric(10,3)',
            isNullable: false,
          },
          {
            name: 'cause',
            type: 'varchar(50)',
            isNullable: false,
          },
          {
            name: 'value_loss',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'note',
            type: 'varchar(500)',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'market.mermas',
      new TableIndex({
        name: 'IDX_merma_tenant_created',
        columnNames: ['tenant_id', 'created_at'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex('market.mermas', 'IDX_merma_tenant_created');
    await queryRunner.dropTable('market.mermas');
  }
}