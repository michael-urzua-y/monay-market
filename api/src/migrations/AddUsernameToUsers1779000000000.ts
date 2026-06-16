import { MigrationInterface, QueryRunner } from 'typeorm';

type UserRow = {
  id: string;
  email: string | null;
  username: string | null;
};

export class AddUsernameToUsers1779000000000 implements MigrationInterface {
  name = 'AddUsernameToUsers1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "market"."users"
      ADD COLUMN IF NOT EXISTS "username" varchar(80)
    `);

    const users: UserRow[] = await queryRunner.query(`
      SELECT "id", "email", "username"
      FROM "market"."users"
      ORDER BY "created_at" ASC, "id" ASC
    `);

    const reserved = new Set<string>();

    for (const user of users) {
      const baseUsername = this.buildBaseUsername(user.email);
      const username = this.ensureUniqueUsername(baseUsername, reserved);

      await queryRunner.query(
        `UPDATE "market"."users" SET "username" = $1 WHERE "id" = $2`,
        [username, user.id],
      );
    }

    await queryRunner.query(`
      ALTER TABLE "market"."users"
      ALTER COLUMN "username" SET NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_username_lower_unique"
      ON "market"."users" (LOWER("username"))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "market"."IDX_users_username_lower_unique"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_username_lower_unique"`);
    await queryRunner.query(`
      ALTER TABLE "market"."users"
      DROP COLUMN IF EXISTS "username"
    `);
  }

  private buildBaseUsername(email: string | null): string {
    const normalizedEmail = (email || '').trim().toLowerCase();

    if (normalizedEmail === 'dueno@example.com') {
      return 'admin';
    }

    if (normalizedEmail === 'cajero@example.com') {
      return 'sebastian.urzuay';
    }

    const localPart = normalizedEmail.includes('@')
      ? normalizedEmail.split('@', 1)[0]
      : normalizedEmail;

    const sanitized = localPart.replace(/[^a-z0-9._-]+/g, '').replace(/^[._-]+|[._-]+$/g, '');
    return sanitized || 'usuario';
  }

  private ensureUniqueUsername(baseUsername: string, reserved: Set<string>): string {
    let candidate = baseUsername;
    let suffix = 2;

    while (reserved.has(candidate)) {
      candidate = `${baseUsername}${suffix}`;
      suffix += 1;
    }

    reserved.add(candidate);
    return candidate;
  }
}
