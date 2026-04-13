import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateArqueosTable1775959555605 implements MigrationInterface {
    name = 'CreateArqueosTable1775959555605'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "market"."arqueos" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "tenant_id" uuid NOT NULL, "user_id" uuid NOT NULL, "expected_amount" integer NOT NULL, "counted_amount" integer NOT NULL, "difference" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_582465d07d158cca3189a918f37" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "market"."arqueos" ADD CONSTRAINT "FK_614f2a337f50dc7344efb564d41" FOREIGN KEY ("tenant_id") REFERENCES "market"."tenants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "market"."arqueos" ADD CONSTRAINT "FK_94f86ad616b0bbc80b46ee7cd8f" FOREIGN KEY ("user_id") REFERENCES "market"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "market"."arqueos" DROP CONSTRAINT "FK_94f86ad616b0bbc80b46ee7cd8f"`);
        await queryRunner.query(`ALTER TABLE "market"."arqueos" DROP CONSTRAINT "FK_614f2a337f50dc7344efb564d41"`);
        await queryRunner.query(`DROP TABLE "market"."arqueos"`);
    }

}
