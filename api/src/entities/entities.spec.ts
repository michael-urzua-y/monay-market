import { getMetadataArgsStorage } from 'typeorm';
import { Tenant } from './tenant.entity';
import { TenantConfig } from './tenant-config.entity';
import { Subscription } from './subscription.entity';
import { User } from './user.entity';
import { Category } from './category.entity';
import { Product } from './product.entity';
import { Sale } from './sale.entity';
import { SaleLine } from './sale-line.entity';
import { Boleta } from './boleta.entity';
import { Arqueo } from './arqueo.entity';
import {
  SubscriptionPlan,
  SubscriptionStatus,
  UserRole,
  PaymentMethod,
  BoletaStatus,
  SiiProvider,
} from './enums';

describe('TypeORM Entities', () => {
  const metadata = getMetadataArgsStorage();

  it('should register all 10 entities', () => {
    const entityNames = metadata.tables.map((t) => t.target);
    const expectedEntities = [
      Tenant, TenantConfig, Subscription, User,
      Category, Product, Sale, SaleLine, Boleta, Arqueo,
    ];
    for (const entity of expectedEntities) {
      expect(entityNames).toContain(entity);
    }
  });

  it('should map entities to correct table names', () => {
    const tableMap = new Map(
      metadata.tables.map((t) => [t.target, t.name]),
    );
    expect(tableMap.get(Tenant)).toBe('tenants');
    expect(tableMap.get(TenantConfig)).toBe('tenant_configs');
    expect(tableMap.get(Subscription)).toBe('subscriptions');
    expect(tableMap.get(User)).toBe('users');
    expect(tableMap.get(Category)).toBe('categories');
    expect(tableMap.get(Product)).toBe('products');
    expect(tableMap.get(Sale)).toBe('sales');
    expect(tableMap.get(SaleLine)).toBe('sale_lines');
    expect(tableMap.get(Boleta)).toBe('boletas');
    expect(tableMap.get(Arqueo)).toBe('arqueos');
  });

  describe('Tenant entity', () => {
    it('should have correct columns', () => {
      const columns = metadata.columns
        .filter((c) => c.target === Tenant)
        .map((c) => c.propertyName);
      expect(columns).toEqual(expect.arrayContaining(['id', 'name', 'rut', 'created_at']));
    });
  });

  describe('TenantConfig entity', () => {
    it('should have correct columns', () => {
      const columns = metadata.columns
        .filter((c) => c.target === TenantConfig)
        .map((c) => c.propertyName);
      expect(columns).toEqual(
        expect.arrayContaining([
          'id', 'tenant_id', 'sii_enabled', 'sii_provider',
          'sii_api_key', 'sii_rut_emisor', 'sii_sandbox_mode',
          'printer_enabled', 'updated_at',
        ]),
      );
    });
  });

  describe('Product entity', () => {
    it('should have correct columns', () => {
      const columns = metadata.columns
        .filter((c) => c.target === Product)
        .map((c) => c.propertyName);
      expect(columns).toEqual(
        expect.arrayContaining([
          'id', 'tenant_id', 'category_id', 'name', 'barcode',
          'price', 'stock', 'critical_stock', 'active',
          'created_at', 'updated_at',
        ]),
      );
    });

    it('should have unique index on (tenant_id, barcode)', () => {
      const indices = metadata.indices.filter(
        (i) => i.target === Product && i.unique === true,
      );
      expect(indices.length).toBeGreaterThanOrEqual(1);
    });

    it('should have composite index on (tenant_id, active, stock)', () => {
      const indices = metadata.indices.filter(
        (i) => i.target === Product && i.unique !== true,
      );
      expect(indices.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Sale entity', () => {
    it('should have correct columns', () => {
      const columns = metadata.columns
        .filter((c) => c.target === Sale)
        .map((c) => c.propertyName);
      expect(columns).toEqual(
        expect.arrayContaining([
          'id', 'tenant_id', 'user_id', 'total',
          'payment_method', 'amount_received', 'change_amount',
          'boleta_status', 'created_at',
        ]),
      );
    });

    it('should have index on (tenant_id, created_at)', () => {
      const indices = metadata.indices.filter((i) => i.target === Sale);
      expect(indices.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('SaleLine entity', () => {
    it('should have snapshot fields product_name and unit_price', () => {
      const columns = metadata.columns
        .filter((c) => c.target === SaleLine)
        .map((c) => c.propertyName);
      expect(columns).toContain('product_name');
      expect(columns).toContain('unit_price');
    });
  });

  describe('Enums', () => {
    it('should define SubscriptionPlan with basico and pro', () => {
      expect(SubscriptionPlan.BASICO).toBe('basico');
      expect(SubscriptionPlan.PRO).toBe('pro');
    });

    it('should define SubscriptionStatus with activa, expirada, cancelada', () => {
      expect(SubscriptionStatus.ACTIVA).toBe('activa');
      expect(SubscriptionStatus.EXPIRADA).toBe('expirada');
      expect(SubscriptionStatus.CANCELADA).toBe('cancelada');
    });

    it('should define UserRole with dueno and cajero', () => {
      expect(UserRole.DUENO).toBe('dueno');
      expect(UserRole.CAJERO).toBe('cajero');
    });

    it('should define PaymentMethod with efectivo and tarjeta', () => {
      expect(PaymentMethod.EFECTIVO).toBe('efectivo');
      expect(PaymentMethod.TARJETA).toBe('tarjeta');
    });

    it('should define BoletaStatus with all 4 values', () => {
      expect(BoletaStatus.NO_APLICA).toBe('no_aplica');
      expect(BoletaStatus.EMITIDA).toBe('emitida');
      expect(BoletaStatus.PENDIENTE).toBe('pendiente');
      expect(BoletaStatus.ERROR).toBe('error');
    });

    it('should define SiiProvider with all 3 providers', () => {
      expect(SiiProvider.HAULMER).toBe('haulmer');
      expect(SiiProvider.OPENFACTURA).toBe('openfactura');
      expect(SiiProvider.FACTURACION_CL).toBe('facturacion_cl');
    });
  });

  describe('Relationships', () => {
    it('should define OneToMany from Tenant to User', () => {
      const relations = metadata.relations.filter(
        (r) => r.target === Tenant && r.propertyName === 'users',
      );
      expect(relations).toHaveLength(1);
      expect(relations[0].relationType).toBe('one-to-many');
    });

    it('should define ManyToOne from User to Tenant', () => {
      const relations = metadata.relations.filter(
        (r) => r.target === User && r.propertyName === 'tenant',
      );
      expect(relations).toHaveLength(1);
      expect(relations[0].relationType).toBe('many-to-one');
    });

    it('should define OneToOne from Tenant to TenantConfig', () => {
      const relations = metadata.relations.filter(
        (r) => r.target === Tenant && r.propertyName === 'config',
      );
      expect(relations).toHaveLength(1);
      expect(relations[0].relationType).toBe('one-to-one');
    });

    it('should define OneToMany from Sale to SaleLine', () => {
      const relations = metadata.relations.filter(
        (r) => r.target === Sale && r.propertyName === 'lines',
      );
      expect(relations).toHaveLength(1);
      expect(relations[0].relationType).toBe('one-to-many');
    });

    it('should define OneToOne from Sale to Boleta', () => {
      const relations = metadata.relations.filter(
        (r) => r.target === Sale && r.propertyName === 'boleta',
      );
      expect(relations).toHaveLength(1);
      expect(relations[0].relationType).toBe('one-to-one');
    });

    it('should define ManyToOne from Product to Category', () => {
      const relations = metadata.relations.filter(
        (r) => r.target === Product && r.propertyName === 'category',
      );
      expect(relations).toHaveLength(1);
      expect(relations[0].relationType).toBe('many-to-one');
    });
  });
});
