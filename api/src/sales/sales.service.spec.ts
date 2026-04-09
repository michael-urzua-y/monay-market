import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SalesService } from './sales.service';
import { Sale } from '../entities/sale.entity';
import { PaymentMethod, BoletaStatus } from '../entities/enums';
import { CreateSaleDto } from './dto/create-sale.dto';

describe('SalesService', () => {
  let service: SalesService;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const userId = '22222222-2222-2222-2222-222222222222';
  const productId1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const productId2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  const makeProduct = (overrides: Record<string, unknown> = {}) => ({
    id: productId1,
    tenant_id: tenantId,
    name: 'Coca Cola 1.5L',
    price: 1500,
    stock: 10,
    critical_stock: 3,
    active: true,
    ...overrides,
  });

  let updatedProducts: Array<{ id: string; stock: number }> = [];
  let lockedProducts: Array<Record<string, unknown>> = [];

  const mockQueryBuilder = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn(() => lockedProducts),
  };

  const mockManager = {
    createQueryBuilder: jest.fn(() => mockQueryBuilder),
    create: jest.fn((_entity: unknown, data: Record<string, unknown>) => ({
      id: 'generated-uuid',
      ...data,
    })),
    save: jest.fn((_entity: unknown, data: Record<string, unknown>) => {
      return Promise.resolve({ ...data });
    }),
    update: jest.fn(
      (_entity: unknown, id: string, data: { stock: number }) => {
        updatedProducts.push({ id, stock: data.stock });
        return Promise.resolve({ affected: 1 });
      },
    ),
  };

  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
    manager: mockManager,
  };

  const mockDataSource = {
    createQueryRunner: jest.fn(() => mockQueryRunner),
  };

  // Mock for the Sale repository used by findAll, findOne, closeRegister
  const repoQueryBuilder = {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  };

  const mockSaleRepository = {
    createQueryBuilder: jest.fn(() => repoQueryBuilder),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    updatedProducts = [];
    lockedProducts = [];
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: getRepositoryToken(Sale), useValue: mockSaleRepository },
      ],
    }).compile();

    service = module.get<SalesService>(SalesService);
  });

  describe('efectivo payment', () => {
    it('should create a sale with correct change_amount', async () => {
      lockedProducts = [makeProduct()];

      const dto: CreateSaleDto = {
        lines: [{ product_id: productId1, quantity: 2 }],
        payment_method: PaymentMethod.EFECTIVO,
        amount_received: 5000,
      };

      const result = await service.create(tenantId, userId, dto);

      expect(result.sale.total).toBe(3000);
      expect(result.sale.payment_method).toBe(PaymentMethod.EFECTIVO);
      expect(result.sale.amount_received).toBe(5000);
      expect(result.sale.change_amount).toBe(2000);
      expect(result.sale.boleta_status).toBe(BoletaStatus.NO_APLICA);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.rollbackTransaction).not.toHaveBeenCalled();
    });

    it('should create a sale with exact payment (change = 0)', async () => {
      lockedProducts = [makeProduct()];

      const dto: CreateSaleDto = {
        lines: [{ product_id: productId1, quantity: 2 }],
        payment_method: PaymentMethod.EFECTIVO,
        amount_received: 3000,
      };

      const result = await service.create(tenantId, userId, dto);

      expect(result.sale.change_amount).toBe(0);
    });

    it('should throw INSUFFICIENT_PAYMENT when amount_received < total', async () => {
      lockedProducts = [makeProduct()];

      const dto: CreateSaleDto = {
        lines: [{ product_id: productId1, quantity: 2 }],
        payment_method: PaymentMethod.EFECTIVO,
        amount_received: 1000,
      };

      await expect(service.create(tenantId, userId, dto)).rejects.toThrow(
        BadRequestException,
      );

      try {
        await service.create(tenantId, userId, dto);
      } catch (e) {
        const response = (e as BadRequestException).getResponse();
        expect(response).toEqual({
          error: 'INSUFFICIENT_PAYMENT',
          total: 3000,
          received: 1000,
          missing: 2000,
        });
      }

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should throw INSUFFICIENT_PAYMENT when amount_received is missing for efectivo', async () => {
      lockedProducts = [makeProduct()];

      const dto: CreateSaleDto = {
        lines: [{ product_id: productId1, quantity: 1 }],
        payment_method: PaymentMethod.EFECTIVO,
      };

      await expect(service.create(tenantId, userId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('tarjeta payment', () => {
    it('should create a sale with null amount_received and change_amount', async () => {
      lockedProducts = [makeProduct()];

      const dto: CreateSaleDto = {
        lines: [{ product_id: productId1, quantity: 1 }],
        payment_method: PaymentMethod.TARJETA,
      };

      const result = await service.create(tenantId, userId, dto);

      expect(result.sale.payment_method).toBe(PaymentMethod.TARJETA);
      expect(result.sale.amount_received).toBeNull();
      expect(result.sale.change_amount).toBeNull();
      expect(result.sale.total).toBe(1500);
    });
  });

  describe('stock validation', () => {
    it('should throw INSUFFICIENT_STOCK when quantity exceeds stock', async () => {
      lockedProducts = [makeProduct({ stock: 2 })];

      const dto: CreateSaleDto = {
        lines: [{ product_id: productId1, quantity: 5 }],
        payment_method: PaymentMethod.EFECTIVO,
        amount_received: 10000,
      };

      try {
        await service.create(tenantId, userId, dto);
        fail('Should have thrown');
      } catch (e) {
        const response = (e as BadRequestException).getResponse();
        expect(response).toEqual({
          error: 'INSUFFICIENT_STOCK',
          details: [
            { product_id: productId1, requested: 5, available: 2 },
          ],
        });
      }

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent product', async () => {
      lockedProducts = [];

      const dto: CreateSaleDto = {
        lines: [{ product_id: productId1, quantity: 1 }],
        payment_method: PaymentMethod.TARJETA,
      };

      await expect(service.create(tenantId, userId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('stock deduction', () => {
    it('should deduct stock for each product', async () => {
      lockedProducts = [
        makeProduct({ id: productId1, stock: 10, critical_stock: 2 }),
        makeProduct({
          id: productId2,
          name: 'Pan',
          price: 500,
          stock: 20,
          critical_stock: 5,
        }),
      ];

      const dto: CreateSaleDto = {
        lines: [
          { product_id: productId1, quantity: 3 },
          { product_id: productId2, quantity: 5 },
        ],
        payment_method: PaymentMethod.TARJETA,
      };

      await service.create(tenantId, userId, dto);

      expect(updatedProducts).toEqual([
        { id: productId1, stock: 7 },
        { id: productId2, stock: 15 },
      ]);
    });

    it('should allow stock to reach 0', async () => {
      lockedProducts = [makeProduct({ stock: 3, critical_stock: 2 })];

      const dto: CreateSaleDto = {
        lines: [{ product_id: productId1, quantity: 3 }],
        payment_method: PaymentMethod.TARJETA,
      };

      await service.create(tenantId, userId, dto);

      expect(updatedProducts).toEqual([{ id: productId1, stock: 0 }]);
    });
  });

  describe('critical stock alerts', () => {
    it('should return alert when stock drops below critical_stock', async () => {
      lockedProducts = [
        makeProduct({ stock: 5, critical_stock: 3 }),
      ];

      const dto: CreateSaleDto = {
        lines: [{ product_id: productId1, quantity: 3 }],
        payment_method: PaymentMethod.TARJETA,
      };

      const result = await service.create(tenantId, userId, dto);

      expect(result.critical_stock_alerts).toEqual([
        {
          product_id: productId1,
          product_name: 'Coca Cola 1.5L',
          current_stock: 2,
          critical_stock: 3,
        },
      ]);
    });

    it('should NOT alert when stock reaches exactly 0', async () => {
      lockedProducts = [makeProduct({ stock: 3, critical_stock: 2 })];

      const dto: CreateSaleDto = {
        lines: [{ product_id: productId1, quantity: 3 }],
        payment_method: PaymentMethod.TARJETA,
      };

      const result = await service.create(tenantId, userId, dto);

      expect(result.critical_stock_alerts).toEqual([]);
    });

    it('should NOT alert when stock stays above critical_stock', async () => {
      lockedProducts = [makeProduct({ stock: 10, critical_stock: 3 })];

      const dto: CreateSaleDto = {
        lines: [{ product_id: productId1, quantity: 2 }],
        payment_method: PaymentMethod.TARJETA,
      };

      const result = await service.create(tenantId, userId, dto);

      expect(result.critical_stock_alerts).toEqual([]);
    });
  });

  describe('sale line snapshots', () => {
    it('should copy product_name and unit_price as snapshot', async () => {
      lockedProducts = [
        makeProduct({ name: 'Galletas', price: 800, stock: 10 }),
      ];

      const dto: CreateSaleDto = {
        lines: [{ product_id: productId1, quantity: 2 }],
        payment_method: PaymentMethod.TARJETA,
      };

      const result = await service.create(tenantId, userId, dto);

      expect(result.sale.lines).toHaveLength(1);
      expect(result.sale.lines[0].product_name).toBe('Galletas');
      expect(result.sale.lines[0].unit_price).toBe(800);
      expect(result.sale.lines[0].subtotal).toBe(1600);
      expect(result.sale.lines[0].quantity).toBe(2);
    });
  });

  describe('transaction management', () => {
    it('should rollback on any error and release queryRunner', async () => {
      lockedProducts = [];

      const dto: CreateSaleDto = {
        lines: [{ product_id: productId1, quantity: 1 }],
        payment_method: PaymentMethod.TARJETA,
      };

      await expect(service.create(tenantId, userId, dto)).rejects.toThrow();

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('should use pessimistic_write lock on products', async () => {
      lockedProducts = [makeProduct()];

      const dto: CreateSaleDto = {
        lines: [{ product_id: productId1, quantity: 1 }],
        payment_method: PaymentMethod.TARJETA,
      };

      await service.create(tenantId, userId, dto);

      expect(mockQueryBuilder.setLock).toHaveBeenCalledWith(
        'pessimistic_write',
      );
    });
  });

  describe('findAll', () => {
    it('should query sales filtered by tenant_id', async () => {
      const mockSales = [
        { id: 'sale-1', tenant_id: tenantId, total: 1000 },
      ] as Sale[];
      repoQueryBuilder.getMany.mockResolvedValue(mockSales);

      const result = await service.findAll(tenantId, {});

      expect(mockSaleRepository.createQueryBuilder).toHaveBeenCalledWith('sale');
      expect(repoQueryBuilder.where).toHaveBeenCalledWith(
        'sale.tenant_id = :tenantId',
        { tenantId },
      );
      expect(result).toEqual(mockSales);
    });

    it('should apply date_from filter', async () => {
      repoQueryBuilder.getMany.mockResolvedValue([]);

      await service.findAll(tenantId, { date_from: '2024-01-01' });

      expect(repoQueryBuilder.andWhere).toHaveBeenCalledWith(
        'sale.created_at >= :dateFrom',
        { dateFrom: '2024-01-01' },
      );
    });

    it('should apply date_to filter', async () => {
      repoQueryBuilder.getMany.mockResolvedValue([]);

      await service.findAll(tenantId, { date_to: '2024-12-31' });

      expect(repoQueryBuilder.andWhere).toHaveBeenCalledWith(
        'sale.created_at <= :dateTo',
        { dateTo: '2024-12-31' },
      );
    });

    it('should apply boleta_status filter', async () => {
      repoQueryBuilder.getMany.mockResolvedValue([]);

      await service.findAll(tenantId, {
        boleta_status: BoletaStatus.PENDIENTE,
      });

      expect(repoQueryBuilder.andWhere).toHaveBeenCalledWith(
        'sale.boleta_status = :boletaStatus',
        { boletaStatus: BoletaStatus.PENDIENTE },
      );
    });

    it('should apply all filters together', async () => {
      repoQueryBuilder.getMany.mockResolvedValue([]);

      await service.findAll(tenantId, {
        date_from: '2024-01-01',
        date_to: '2024-12-31',
        boleta_status: BoletaStatus.EMITIDA,
      });

      expect(repoQueryBuilder.andWhere).toHaveBeenCalledTimes(3);
    });

    it('should join lines and boleta relations', async () => {
      repoQueryBuilder.getMany.mockResolvedValue([]);

      await service.findAll(tenantId, {});

      expect(repoQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'sale.lines',
        'lines',
      );
      expect(repoQueryBuilder.leftJoinAndSelect).toHaveBeenCalledWith(
        'sale.boleta',
        'boleta',
      );
    });
  });

  describe('findOne', () => {
    it('should return a sale with relations when found', async () => {
      const saleId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      const mockSale = {
        id: saleId,
        tenant_id: tenantId,
        total: 5000,
        lines: [],
        boleta: null,
      } as unknown as Sale;

      mockSaleRepository.findOne.mockResolvedValue(mockSale);

      const result = await service.findOne(tenantId, saleId);

      expect(mockSaleRepository.findOne).toHaveBeenCalledWith({
        where: { id: saleId, tenant_id: tenantId },
        relations: ['lines', 'boleta'],
      });
      expect(result).toEqual(mockSale);
    });

    it('should throw NotFoundException when sale not found', async () => {
      const saleId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      mockSaleRepository.findOne.mockResolvedValue(null);

      await expect(service.findOne(tenantId, saleId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not return a sale from a different tenant', async () => {
      const saleId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
      mockSaleRepository.findOne.mockResolvedValue(null);

      await expect(
        service.findOne('other-tenant-id', saleId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('closeRegister', () => {
    it('should return summary with zero values when no sales today', async () => {
      repoQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.closeRegister(tenantId);

      expect(result.total_ventas).toBe(0);
      expect(result.cantidad_ventas).toBe(0);
      expect(result.total_efectivo).toBe(0);
      expect(result.cantidad_efectivo).toBe(0);
      expect(result.total_tarjeta).toBe(0);
      expect(result.cantidad_tarjeta).toBe(0);
      expect(result.ventas).toEqual([]);
    });

    it('should correctly sum totals by payment method', async () => {
      const todaySales = [
        { total: 1000, payment_method: PaymentMethod.EFECTIVO },
        { total: 2000, payment_method: PaymentMethod.TARJETA },
        { total: 3000, payment_method: PaymentMethod.EFECTIVO },
        { total: 500, payment_method: PaymentMethod.TARJETA },
      ] as Sale[];

      repoQueryBuilder.getMany.mockResolvedValue(todaySales);

      const result = await service.closeRegister(tenantId);

      expect(result.total_ventas).toBe(6500);
      expect(result.cantidad_ventas).toBe(4);
      expect(result.total_efectivo).toBe(4000);
      expect(result.cantidad_efectivo).toBe(2);
      expect(result.total_tarjeta).toBe(2500);
      expect(result.cantidad_tarjeta).toBe(2);
      expect(result.ventas).toEqual(todaySales);
    });

    it('should handle only efectivo sales', async () => {
      const todaySales = [
        { total: 1500, payment_method: PaymentMethod.EFECTIVO },
      ] as Sale[];

      repoQueryBuilder.getMany.mockResolvedValue(todaySales);

      const result = await service.closeRegister(tenantId);

      expect(result.total_ventas).toBe(1500);
      expect(result.cantidad_ventas).toBe(1);
      expect(result.total_efectivo).toBe(1500);
      expect(result.cantidad_efectivo).toBe(1);
      expect(result.total_tarjeta).toBe(0);
      expect(result.cantidad_tarjeta).toBe(0);
    });

    it('should handle only tarjeta sales', async () => {
      const todaySales = [
        { total: 2500, payment_method: PaymentMethod.TARJETA },
      ] as Sale[];

      repoQueryBuilder.getMany.mockResolvedValue(todaySales);

      const result = await service.closeRegister(tenantId);

      expect(result.total_ventas).toBe(2500);
      expect(result.cantidad_ventas).toBe(1);
      expect(result.total_efectivo).toBe(0);
      expect(result.cantidad_efectivo).toBe(0);
      expect(result.total_tarjeta).toBe(2500);
      expect(result.cantidad_tarjeta).toBe(1);
    });

    it('should filter by tenant_id and current day', async () => {
      repoQueryBuilder.getMany.mockResolvedValue([]);

      await service.closeRegister(tenantId);

      expect(repoQueryBuilder.where).toHaveBeenCalledWith(
        'sale.tenant_id = :tenantId',
        { tenantId },
      );
      expect(repoQueryBuilder.andWhere).toHaveBeenCalledWith(
        'sale.created_at >= :startOfDay',
        expect.objectContaining({ startOfDay: expect.any(Date) }),
      );
      expect(repoQueryBuilder.andWhere).toHaveBeenCalledWith(
        'sale.created_at <= :endOfDay',
        expect.objectContaining({ endOfDay: expect.any(Date) }),
      );
    });
  });
});
