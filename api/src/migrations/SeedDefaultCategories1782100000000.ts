import { MigrationInterface, QueryRunner } from "typeorm";

export class SeedDefaultCategories1782100000000 implements MigrationInterface {
    name = 'SeedDefaultCategories1782100000000'

    private readonly categories = [
        'Panadería',
        'Snacks',
        'Bebidas',
        'Lácteos',
        'Cecinas',
        'Abarrotes',
        'Aseo',
        'No perecibles',
        'Confites',
        'Congelados',
        'Frutas y Verduras',
        'Huevos',
        'Licores',
        'Cigarros',
        'Varios',
    ];

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Get all existing tenants
        const tenants = await queryRunner.query(
            `SELECT id FROM "market"."tenants"`
        );

        for (const tenant of tenants) {
            for (const categoryName of this.categories) {
                // Only insert if category doesn't already exist for this tenant
                const existing = await queryRunner.query(
                    `SELECT id FROM "market"."categories" WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)`,
                    [tenant.id, categoryName]
                );

                if (existing.length === 0) {
                    await queryRunner.query(
                        `INSERT INTO "market"."categories" (id, tenant_id, name) VALUES (uuid_generate_v4(), $1, $2)`,
                        [tenant.id, categoryName]
                    );
                }
            }
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remove only the seeded categories (by name match)
        for (const categoryName of this.categories) {
            await queryRunner.query(
                `DELETE FROM "market"."categories" WHERE LOWER(name) = LOWER($1) AND id NOT IN (SELECT DISTINCT category_id FROM "market"."products" WHERE category_id IS NOT NULL)`,
                [categoryName]
            );
        }
    }
}
