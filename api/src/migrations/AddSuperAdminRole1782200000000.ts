import { MigrationInterface, QueryRunner } from "typeorm";
import * as bcrypt from 'bcrypt';

export class AddSuperAdminRole1782200000000 implements MigrationInterface {
    name = 'AddSuperAdminRole1782200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Add 'superadmin' to the UserRole enum (must be outside transaction for PostgreSQL)
        try {
            await queryRunner.commitTransaction();
        } catch {
            // Transaction may not be active
        }
        await queryRunner.query(`
            ALTER TYPE "market"."user_role_enum" ADD VALUE IF NOT EXISTS 'superadmin'
        `);
        try {
            await queryRunner.startTransaction();
        } catch {
            // Transaction may already be started
        }

        // Make tenant_id nullable for superadmin users
        await queryRunner.query(`
            ALTER TABLE "market"."users" ALTER COLUMN "tenant_id" DROP NOT NULL
        `);

        // Create the superadmin user (password from env or dev fallback)
        const password = process.env.SUPERADMIN_PASSWORD || 'a1234567890';
        const passwordHash = await bcrypt.hash(password, 10);
        await queryRunner.query(`
            INSERT INTO "market"."users" (id, tenant_id, email, username, password_hash, role, active)
            VALUES (uuid_generate_v4(), NULL, 'michael', 'michael', $1, 'superadmin', true)
            ON CONFLICT DO NOTHING
        `, [passwordHash]);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DELETE FROM "market"."users" WHERE role = 'superadmin' AND username = 'michael'
        `);
        await queryRunner.query(`
            UPDATE "market"."users" SET tenant_id = tenant_id WHERE tenant_id IS NULL
        `);
    }
}
