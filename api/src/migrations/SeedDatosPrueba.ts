import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcrypt';

/**
 * Seed con datos de prueba para desarrollo local.
 * Productos reales de almacén chileno con precios estimados en CLP.
 */
export class SeedDatosPrueba1700000000001 implements MigrationInterface {
  name = 'SeedDatosPrueba1700000000001';

  private readonly BCRYPT_ROUNDS = 10;

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (process.env.SEED_DEMO_DATA !== 'true') {
      console.warn('SEED_DEMO_DATA no está activo. Se omiten datos demo.');
      return;
    }

    const passwordHash = await bcrypt.hash(this.getSeedPassword(), this.BCRYPT_ROUNDS);

    // Tenant
    const [tenant] = await queryRunner.query(
      `INSERT INTO "market"."tenants" ("name", "rut") VALUES ($1, $2) RETURNING "id"`,
      ['Almacén Don Pedro', '76.123.456-7'],
    );
    const t = tenant.id;

    // Config
    await queryRunner.query(
      `INSERT INTO "market"."tenant_configs" ("tenant_id", "sii_enabled", "sii_sandbox_mode", "printer_enabled") VALUES ($1, $2, $3, $4)`,
      [t, false, true, false],
    );

    // Suscripción
    await queryRunner.query(
      `INSERT INTO "market"."subscriptions" ("tenant_id", "plan", "start_date", "end_date", "status") VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE + INTERVAL '1 year', $3)`,
      [t, 'pro', 'activa'],
    );

    // Usuarios
    await queryRunner.query(
      `INSERT INTO "market"."users" ("tenant_id", "email", "password_hash", "role", "active") VALUES ($1, $2, $3, $4, $5)`,
      [t, 'dueno@example.com', passwordHash, 'dueno', true],
    );
    await queryRunner.query(
      `INSERT INTO "market"."users" ("tenant_id", "email", "password_hash", "role", "active") VALUES ($1, $2, $3, $4, $5)`,
      [t, 'cajero@example.com', passwordHash, 'cajero', true],
    );

    // Categorías organizadas para almacén
    const cats: Record<string, string> = {};
    for (const name of [
      'Bebidas',           // Gaseosas, jugos, aguas, energéticas
      'Lácteos y Postres', // Leche, yogurt, quesos, mantequilla
      'Abarrotes',         // Arroz, fideos, legumbres, aceite, harina
      'Panadería',        // Pan, queques, galletas
      'Snacks y Dulces',  // Papas fritas, chocolates, caramelos
      'Carnes y Embutidos', // Pollo, carne, cecinas
      'Congelados',        // Verduras congeladas, papas fritas, helados
      'Frutas y Verduras', // Frutas y verduras frescas
      'Desayuno',         // Cereales, avena, café, té
      'Limpieza',         // Detergente, cloro, esponjas
      'Aseo Personal',    // Shampoo, jabón, pasta de dientes
      'Mascotas',         // Alimento para perro/gato
      'Otros',            // Pilas, encendedores, bolsas
    ]) {
      const [row] = await queryRunner.query(
        `INSERT INTO "market"."categories" ("tenant_id", "name") VALUES ($1, $2) RETURNING "id"`,
        [t, name],
      );
      cats[name] = row.id;
    }

    // Productos — precios estimados de almacén chileno en CLP
    const productos = [
      // Bebidas y Licores
      { cat: 'Bebidas', name: 'Coca-Cola 1.5L', barcode: '7801610223123', price: 1490, stock: 48, cs: 10 },
      { cat: 'Bebidas', name: 'Coca-Cola Zero 1.5L', barcode: '7801610223130', price: 1490, stock: 30, cs: 8 },
      { cat: 'Bebidas', name: 'Fanta 1.5L', barcode: '7801610223147', price: 1390, stock: 24, cs: 8 },
      { cat: 'Bebidas', name: 'Sprite 1.5L', barcode: '7801610223154', price: 1390, stock: 20, cs: 8 },
      { cat: 'Bebidas', name: 'Agua Mineral Cachantún 1L', barcode: '7801620003456', price: 690, stock: 60, cs: 12 },
      { cat: 'Bebidas', name: 'Agua Cachantún con Gas 1.5L', barcode: '7801620003463', price: 790, stock: 36, cs: 10 },
      { cat: 'Bebidas', name: 'Jugo Néctar Andina Naranja 1L', barcode: '7801630004567', price: 890, stock: 24, cs: 6 },
      { cat: 'Bebidas', name: 'Jugo Néctar Andina Durazno 1L', barcode: '7801630004574', price: 890, stock: 20, cs: 6 },
      { cat: 'Bebidas', name: 'Bilz 1.5L', barcode: '7801610300123', price: 1290, stock: 18, cs: 6 },
      { cat: 'Bebidas', name: 'Pap 1.5L', barcode: '7801610300130', price: 1290, stock: 18, cs: 6 },

      // Snacks y Dulces
      { cat: 'Snacks y Dulces', name: 'Super 8 Nestlé 29g', barcode: '7613030612339', price: 350, stock: 100, cs: 20 },
      { cat: 'Snacks y Dulces', name: 'Sahne Nuss Nestlé 25g', barcode: '7613030612346', price: 490, stock: 80, cs: 15 },
      { cat: 'Snacks y Dulces', name: 'Cubanitos Fruna 200g', barcode: '7801050010123', price: 1290, stock: 40, cs: 8 },
      { cat: 'Snacks y Dulces', name: 'Chocolate Verona Fruna 100g', barcode: '7801050010130', price: 990, stock: 35, cs: 8 },
      { cat: 'Snacks y Dulces', name: 'Bombón Fruna Surtido 100g', barcode: '7801050010147', price: 890, stock: 30, cs: 8 },
      { cat: 'Snacks y Dulces', name: 'Calugas Fruna Manjar 100g', barcode: '7801050010154', price: 690, stock: 45, cs: 10 },
      { cat: 'Snacks y Dulces', name: 'Masticable Fruna Frutal 100g', barcode: '7801050010161', price: 590, stock: 50, cs: 10 },
      { cat: 'Snacks y Dulces', name: 'Papas Fritas Lays Clásicas 150g', barcode: '7802215000789', price: 1290, stock: 30, cs: 5 },
      { cat: 'Snacks y Dulces', name: 'Galletas Tritón 126g', barcode: '7802225001234', price: 590, stock: 25, cs: 8 },
      { cat: 'Snacks y Dulces', name: 'Galletas Morocha 130g', barcode: '7802225001241', price: 590, stock: 25, cs: 8 },
      { cat: 'Snacks y Dulces', name: 'Ramitas Evercrisp 200g', barcode: '7802215000796', price: 990, stock: 20, cs: 5 },

      // Lácteos y Postres
      { cat: 'Lácteos y Postres', name: 'Leche Entera Colún 1L', barcode: '7801060001234', price: 990, stock: 48, cs: 12 },
      { cat: 'Lácteos y Postres', name: 'Leche Semidescremada Colún 1L', barcode: '7801060001241', price: 990, stock: 36, cs: 12 },
      { cat: 'Lácteos y Postres', name: 'Yogurt Colún Natural 1L', barcode: '7801060002234', price: 1290, stock: 20, cs: 6 },
      { cat: 'Lácteos y Postres', name: 'Mantequilla Colún 250g', barcode: '7801060003234', price: 2490, stock: 15, cs: 4 },
      { cat: 'Lácteos y Postres', name: 'Queso Gauda Laminado 250g', barcode: '7801060004234', price: 2990, stock: 12, cs: 3 },

      // Panadería
      { cat: 'Panadería', name: 'Pan de Molde Ideal 580g', barcode: '7801070001234', price: 1990, stock: 20, cs: 5 },
      { cat: 'Panadería', name: 'Hallulla Pack 10 unidades', barcode: '7801070002234', price: 1490, stock: 15, cs: 4 },

      // Limpieza
      { cat: 'Limpieza', name: 'Detergente Omo 800g', barcode: '7801030005678', price: 3490, stock: 15, cs: 3 },
      { cat: 'Limpieza', name: 'Lavaloza Quix 750ml', barcode: '7801030005685', price: 1490, stock: 20, cs: 5 },
      { cat: 'Limpieza', name: 'Cloro Clorox 1L', barcode: '7801030005709', price: 1290, stock: 18, cs: 5 },

      // Aseo Personal
      { cat: 'Aseo Personal', name: 'Papel Higiénico Noble 4 rollos', barcode: '7801030005692', price: 1990, stock: 30, cs: 8 },

      // Abarrotes
      { cat: 'Abarrotes', name: 'Arroz Tucapel Grado 1 1kg', barcode: '7801080001234', price: 1290, stock: 40, cs: 10 },
      { cat: 'Abarrotes', name: 'Fideos Lucchetti Spaghetti 400g', barcode: '7801080002234', price: 690, stock: 50, cs: 12 },
      { cat: 'Abarrotes', name: 'Aceite Maravilla Chef 1L', barcode: '7801080003234', price: 1990, stock: 20, cs: 5 },
      { cat: 'Abarrotes', name: 'Azúcar Iansa 1kg', barcode: '7801080004234', price: 990, stock: 30, cs: 8 },
      { cat: 'Abarrotes', name: 'Sal Lobos 1kg', barcode: '7801080005234', price: 490, stock: 25, cs: 5 },
      { cat: 'Abarrotes', name: 'Café Nescafé Tradición 170g', barcode: '7613036612339', price: 4990, stock: 15, cs: 3 },
      { cat: 'Abarrotes', name: 'Té Club Supreme 100 bolsitas', barcode: '7801090001234', price: 1990, stock: 18, cs: 4 },

      // Congelados
      { cat: 'Congelados', name: 'Helado Nestlé Mega 85ml', barcode: '7613030700123', price: 790, stock: 40, cs: 10 },
      { cat: 'Congelados', name: 'Empanadas de Pino Pack 6', barcode: '7801100001234', price: 3990, stock: 10, cs: 3 },

      // Mascotas
      { cat: 'Mascotas', name: 'Champion Dog Adulto 3kg', barcode: '7801110001234', price: 5990, stock: 8, cs: 2 },
      { cat: 'Mascotas', name: 'Champion Cat Adulto 1.5kg', barcode: '7801110002234', price: 3990, stock: 10, cs: 3 },
    ];

    for (const p of productos) {
      await queryRunner.query(
        `INSERT INTO "market"."products" ("tenant_id", "category_id", "name", "barcode", "price", "stock", "critical_stock", "active")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [t, cats[p.cat], p.name, p.barcode, p.price, p.stock, p.cs, true],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [tenant] = await queryRunner.query(
      `SELECT "id" FROM "market"."tenants" WHERE "name" = $1 AND "rut" = $2`,
      ['Almacén Don Pedro', '76.123.456-7'],
    );
    if (tenant) {
      await queryRunner.query(`DELETE FROM "market"."products" WHERE "tenant_id" = $1`, [tenant.id]);
      await queryRunner.query(`DELETE FROM "market"."categories" WHERE "tenant_id" = $1`, [tenant.id]);
      await queryRunner.query(`DELETE FROM "market"."users" WHERE "tenant_id" = $1`, [tenant.id]);
      await queryRunner.query(`DELETE FROM "market"."subscriptions" WHERE "tenant_id" = $1`, [tenant.id]);
      await queryRunner.query(`DELETE FROM "market"."tenant_configs" WHERE "tenant_id" = $1`, [tenant.id]);
      await queryRunner.query(`DELETE FROM "market"."tenants" WHERE "id" = $1`, [tenant.id]);
    }
  }

  private getSeedPassword(): string {
    const seedPassword = process.env.SEED_PASSWORD;
    if (seedPassword) {
      return seedPassword;
    }

    throw new Error('SEED_PASSWORD debe configurarse cuando SEED_DEMO_DATA=true');
  }
}
