import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DashboardService } from './dashboard.service';
import { Sale } from '../entities/sale.entity';
import { Product } from '../entities/product.entity';

describe('DashboardService', () => {
  let service: DashboardService;

  const tenantId = '11111111-1111-1111-1111-111111111111';

  // Sale query builder mock
  const saleQb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawOne: jest.fn(),
    getRawMany: jest.fn(),
  };

  const mockSaleRepository = {
    createQueryBuilder: jest.fn(() => saleQb),
  };

  // Product query builder mock
  const productQb = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn(),
    getRawOne: jest.fn(),
  };

  const mockProductRepository = {
    createQueryBuilder: jest.fn(() => productQb),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: getRepositoryToken(Sale), useValue: mockSaleRepository },
        { provide: getRepositoryToken(Product), useValue: mockProductRepository },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  describe('getToday', () => {
    it('should return total and count of sales for today', async () => {
      saleQb.getRawOne.mockResolvedValue({
        total_ventas: '15000',
        cantidad_ventas: '3',
      });

      const result = await service.getToday(tenantId);

      expect(result).toEqual({
        total_ventas: 15000,
        cantidad_ventas: 3,
      });
      expect(saleQb.where).toHaveBeenCalledWith(
        'sale.tenant_id = :tenantId',
        { tenantId },
      );
    });

    it('should return zeros when no sales today', async () => {
      saleQb.getRawOne.mockResolvedValue({
        total_ventas: '0',
        cantidad_ventas: '0',
      });

      const result = await service.getToday(tenantId);

      expect(result).toEqual({
        total_ventas: 0,
        cantidad_ventas: 0,
      });
    });
  });

  describe('getMonthly', () => {
    it('should return current and previous month totals with variation', async () => {
      saleQb.getRawOne
        .mockResolvedValueOnce({ total: '200000' })  // current month
        .mockResolvedValueOnce({ total: '150000' }); // previous month

      const result = await service.getMonthly(tenantId);

      expect(result.mes_actual).toBe(200000);
      expect(result.mes_anterior).toBe(150000);
      expect(result.variacion_porcentual).toBeCloseTo(33.3333, 2);
    });

    it('should return null variation when previous month is 0', async () => {
      saleQb.getRawOne
        .mockResolvedValueOnce({ total: '100000' })
        .mockResolvedValueOnce({ total: '0' });

      const result = await service.getMonthly(tenantId);

      expect(result.mes_actual).toBe(100000);
      expect(result.mes_anterior).toBe(0);
      expect(result.variacion_porcentual).toBeNull();
    });

    it('should return negative variation when current < previous', async () => {
      saleQb.getRawOne
        .mockResolvedValueOnce({ total: '80000' })
        .mockResolvedValueOnce({ total: '100000' });

      const result = await service.getMonthly(tenantId);

      expect(result.variacion_porcentual).toBeCloseTo(-20, 2);
    });

    it('should return 0 variation when both months are equal', async () => {
      saleQb.getRawOne
        .mockResolvedValueOnce({ total: '50000' })
        .mockResolvedValueOnce({ total: '50000' });

      const result = await service.getMonthly(tenantId);

      expect(result.variacion_porcentual).toBe(0);
    });

    it('should return null variation when both months are 0', async () => {
      saleQb.getRawOne
        .mockResolvedValueOnce({ total: '0' })
        .mockResolvedValueOnce({ total: '0' });

      const result = await service.getMonthly(tenantId);

      expect(result.variacion_porcentual).toBeNull();
    });
  });

  describe('getDailyChart', () => {
    it('should return one entry per day of current month', async () => {
      saleQb.getRawMany.mockResolvedValue([]);

      const result = await service.getDailyChart(tenantId);

      const now = new Date();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      expect(result).toHaveLength(daysInMonth);
    });

    it('should fill days with 0 when no sales', async () => {
      saleQb.getRawMany.mockResolvedValue([]);

      const result = await service.getDailyChart(tenantId);

      for (const entry of result) {
        expect(entry.total).toBe(0);
        expect(entry.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it('should include sales totals for days with data', async () => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const dateStr = `${year}-${month}-05`;

      saleQb.getRawMany.mockResolvedValue([
        { fecha: dateStr, total: '25000' },
      ]);

      const result = await service.getDailyChart(tenantId);

      const day5 = result.find((e) => e.fecha === dateStr);
      expect(day5).toBeDefined();
      expect(day5!.total).toBe(25000);

      // Other days should be 0
      const otherDays = result.filter((e) => e.fecha !== dateStr);
      for (const entry of otherDays) {
        expect(entry.total).toBe(0);
      }
    });

    it('should filter by tenant_id', async () => {
      saleQb.getRawMany.mockResolvedValue([]);

      await service.getDailyChart(tenantId);

      expect(saleQb.where).toHaveBeenCalledWith(
        'sale.tenant_id = :tenantId',
        { tenantId },
      );
    });
  });

  describe('getCriticalStock', () => {
    it('should return products with stock > 0 and stock < critical_stock', async () => {
      const criticalProducts = [
        { id: 'p1', name: 'Leche', stock: 2, critical_stock: 5 },
        { id: 'p2', name: 'Pan', stock: 1, critical_stock: 10 },
      ];
      productQb.getMany.mockResolvedValue(criticalProducts);

      const result = await service.getCriticalStock(tenantId);

      expect(result).toEqual(criticalProducts);
      expect(productQb.where).toHaveBeenCalledWith(
        'product.tenant_id = :tenantId',
        { tenantId },
      );
      expect(productQb.andWhere).toHaveBeenCalledWith(
        'product.active = :active',
        { active: true },
      );
      expect(productQb.andWhere).toHaveBeenCalledWith('product.stock > 0');
      expect(productQb.andWhere).toHaveBeenCalledWith(
        'product.stock < product.critical_stock',
      );
      expect(productQb.orderBy).toHaveBeenCalledWith('product.stock', 'ASC');
    });

    it('should return empty array when no critical stock products', async () => {
      productQb.getMany.mockResolvedValue([]);

      const result = await service.getCriticalStock(tenantId);

      expect(result).toEqual([]);
    });
  });

  describe('getInventoryValue', () => {
    it('should return sum of price * stock for active products', async () => {
      productQb.getRawOne.mockResolvedValue({ valor_total: '1250000' });

      const result = await service.getInventoryValue(tenantId);

      expect(result).toEqual({ valor_total: 1250000 });
      expect(productQb.where).toHaveBeenCalledWith(
        'product.tenant_id = :tenantId',
        { tenantId },
      );
      expect(productQb.andWhere).toHaveBeenCalledWith(
        'product.active = :active',
        { active: true },
      );
    });

    it('should return 0 when no active products', async () => {
      productQb.getRawOne.mockResolvedValue({ valor_total: '0' });

      const result = await service.getInventoryValue(tenantId);

      expect(result).toEqual({ valor_total: 0 });
    });
  });
});
