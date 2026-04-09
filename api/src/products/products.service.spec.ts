import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpService } from '@nestjs/axios';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { Workbook } from 'exceljs';
import { ProductsService } from './products.service';
import { Product } from '../entities/product.entity';
import { SaleLine } from '../entities/sale-line.entity';
import { Category } from '../entities/category.entity';

describe('ProductsService', () => {
  let service: ProductsService;

  const tenantId = 'tenant-uuid-1';

  const mockProduct: Product = {
    id: 'product-uuid-1',
    tenant_id: tenantId,
    category_id: 'cat-uuid-1',
    name: 'Coca Cola 1.5L',
    barcode: '7801234567890',
    price: 1500,
    stock: 50,
    critical_stock: 5,
    active: true,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    tenant: null as any,
    category: null,
    sale_lines: [],
  };

  const mockProductRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockSaleLineRepo = {
    createQueryBuilder: jest.fn(),
  };

  const mockHttpService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: getRepositoryToken(Product), useValue: mockProductRepo },
        { provide: getRepositoryToken(SaleLine), useValue: mockSaleLineRepo },
        { provide: getRepositoryToken(Category), useValue: { find: jest.fn() } },
        { provide: HttpService, useValue: mockHttpService },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createDto = {
      name: 'Coca Cola 1.5L',
      barcode: '7801234567890',
      price: 1500,
      stock: 50,
    };

    it('should create a product successfully', async () => {
      mockProductRepo.findOne.mockResolvedValue(null);
      mockProductRepo.create.mockReturnValue({ ...mockProduct });
      mockProductRepo.save.mockResolvedValue({ ...mockProduct });

      const result = await service.create(tenantId, createDto);

      expect(mockProductRepo.create).toHaveBeenCalledWith({
        ...createDto,
        tenant_id: tenantId,
        active: true,
      });
      expect(result.name).toBe('Coca Cola 1.5L');
    });

    it('should throw BadRequestException for duplicate barcode', async () => {
      mockProductRepo.findOne.mockResolvedValue(mockProduct);

      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow creating product without barcode', async () => {
      const dto = { name: 'Pan', price: 500, stock: 100 };
      mockProductRepo.create.mockReturnValue({ ...mockProduct, barcode: null });
      mockProductRepo.save.mockResolvedValue({ ...mockProduct, barcode: null });

      const result = await service.create(tenantId, dto);

      expect(mockProductRepo.findOne).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  describe('findAll', () => {
    it('should return products filtered by tenant', async () => {
      mockProductRepo.find.mockResolvedValue([mockProduct]);

      const result = await service.findAll(tenantId, {});

      expect(mockProductRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: tenantId, active: true },
        }),
      );
      expect(result).toHaveLength(1);
    });

    it('should apply name filter with ILIKE', async () => {
      mockProductRepo.find.mockResolvedValue([mockProduct]);

      await service.findAll(tenantId, { name: 'coca' });

      const callArgs = mockProductRepo.find.mock.calls[0][0];
      expect(callArgs.where.name).toBeDefined();
    });

    it('should apply category_id filter', async () => {
      mockProductRepo.find.mockResolvedValue([]);

      await service.findAll(tenantId, { category_id: 'cat-uuid-1' });

      const callArgs = mockProductRepo.find.mock.calls[0][0];
      expect(callArgs.where.category_id).toBe('cat-uuid-1');
    });

    it('should apply barcode filter', async () => {
      mockProductRepo.find.mockResolvedValue([mockProduct]);

      await service.findAll(tenantId, { barcode: '7801234567890' });

      const callArgs = mockProductRepo.find.mock.calls[0][0];
      expect(callArgs.where.barcode).toBe('7801234567890');
    });
  });

  describe('findOne', () => {
    it('should return a product by id and tenant', async () => {
      mockProductRepo.findOne.mockResolvedValue(mockProduct);

      const result = await service.findOne(tenantId, mockProduct.id);

      expect(mockProductRepo.findOne).toHaveBeenCalledWith({
        where: { id: mockProduct.id, tenant_id: tenantId },
      });
      expect(result.id).toBe(mockProduct.id);
    });

    it('should throw NotFoundException if product not found', async () => {
      mockProductRepo.findOne.mockResolvedValue(null);

      await expect(
        service.findOne(tenantId, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update product fields', async () => {
      mockProductRepo.findOne.mockResolvedValueOnce({ ...mockProduct });
      mockProductRepo.save.mockResolvedValue({
        ...mockProduct,
        name: 'Coca Cola 2L',
      });

      const result = await service.update(tenantId, mockProduct.id, {
        name: 'Coca Cola 2L',
      });

      expect(result.name).toBe('Coca Cola 2L');
    });

    it('should throw BadRequestException when updating to duplicate barcode', async () => {
      const otherProduct = { ...mockProduct, id: 'product-uuid-2', barcode: '9999999999999' };
      mockProductRepo.findOne
        .mockResolvedValueOnce({ ...mockProduct })
        .mockResolvedValueOnce(otherProduct);

      await expect(
        service.update(tenantId, mockProduct.id, { barcode: '9999999999999' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow updating barcode to same value', async () => {
      mockProductRepo.findOne.mockResolvedValueOnce({ ...mockProduct });
      mockProductRepo.save.mockResolvedValue({ ...mockProduct });

      const result = await service.update(tenantId, mockProduct.id, {
        barcode: '7801234567890',
      });

      expect(result).toBeDefined();
    });

    it('should allow setting barcode to null', async () => {
      mockProductRepo.findOne.mockResolvedValueOnce({ ...mockProduct });
      mockProductRepo.save.mockResolvedValue({
        ...mockProduct,
        barcode: null,
      });

      const result = await service.update(tenantId, mockProduct.id, {
        barcode: null,
      });

      expect(result.barcode).toBeNull();
    });
  });

  describe('softDelete', () => {
    const mockQueryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn(),
    };

    beforeEach(() => {
      mockSaleLineRepo.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    });

    it('should soft-delete product without recent sales', async () => {
      mockProductRepo.findOne.mockResolvedValue({ ...mockProduct });
      mockQueryBuilder.getCount.mockResolvedValue(0);
      mockProductRepo.save.mockResolvedValue({
        ...mockProduct,
        active: false,
      });

      await service.softDelete(tenantId, mockProduct.id);

      expect(mockProductRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ active: false }),
      );
    });

    it('should throw BadRequestException if product has recent sales', async () => {
      mockProductRepo.findOne.mockResolvedValue({ ...mockProduct });
      mockQueryBuilder.getCount.mockResolvedValue(3);

      await expect(
        service.softDelete(tenantId, mockProduct.id),
      ).rejects.toThrow(BadRequestException);
    });

    it('should include PRODUCT_HAS_RECENT_SALES error code', async () => {
      mockProductRepo.findOne.mockResolvedValue({ ...mockProduct });
      mockQueryBuilder.getCount.mockResolvedValue(1);

      try {
        await service.softDelete(tenantId, mockProduct.id);
        fail('Should have thrown');
      } catch (e) {
        expect(e.getResponse()).toEqual(
          expect.objectContaining({ error: 'PRODUCT_HAS_RECENT_SALES' }),
        );
      }
    });

    it('should throw NotFoundException if product does not exist', async () => {
      mockProductRepo.findOne.mockResolvedValue(null);

      await expect(
        service.softDelete(tenantId, 'non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('lookupBarcode', () => {
    it('should return product data from Open Food Facts', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: {
            status: 1,
            product: {
              product_name: 'Coca-Cola',
              categories_tags: ['en:beverages', 'en:sodas'],
            },
          },
        }),
      );

      const result = await service.lookupBarcode('5449000000996');

      expect(result).toEqual({
        barcode: '5449000000996',
        name: 'Coca-Cola',
        category_suggestion: 'sodas',
      });
    });

    it('should return nulls when product not found in Open Food Facts', async () => {
      mockHttpService.get.mockReturnValue(
        of({ data: { status: 0 } }),
      );

      const result = await service.lookupBarcode('0000000000000');

      expect(result).toEqual({
        barcode: '0000000000000',
        name: null,
        category_suggestion: null,
      });
    });

    it('should return nulls when API call fails', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Network error')),
      );

      const result = await service.lookupBarcode('5449000000996');

      expect(result).toEqual({
        barcode: '5449000000996',
        name: null,
        category_suggestion: null,
      });
    });

    it('should handle product with no product_name', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: {
            status: 1,
            product: {
              categories_tags: ['en:beverages'],
            },
          },
        }),
      );

      const result = await service.lookupBarcode('1234567890123');

      expect(result.name).toBeNull();
      expect(result.category_suggestion).toBe('beverages');
    });

    it('should handle product with no categories_tags', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: {
            status: 1,
            product: {
              product_name: 'Some Product',
            },
          },
        }),
      );

      const result = await service.lookupBarcode('1234567890123');

      expect(result.name).toBe('Some Product');
      expect(result.category_suggestion).toBeNull();
    });

    it('should strip language prefix from category tag', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: {
            status: 1,
            product: {
              product_name: 'Test',
              categories_tags: ['es:bebidas-gaseosas'],
            },
          },
        }),
      );

      const result = await service.lookupBarcode('1234567890123');

      expect(result.category_suggestion).toBe('bebidas-gaseosas');
    });
  });

  describe('importFromExcel', () => {
    async function createExcelBuffer(rows: any[][]): Promise<Buffer> {
      const workbook = new Workbook();
      const sheet = workbook.addWorksheet('Products');
      for (const row of rows) {
        sheet.addRow(row);
      }
      const arrayBuffer = await workbook.xlsx.writeBuffer();
      return Buffer.from(arrayBuffer);
    }

    it('should update products with valid Excel data', async () => {
      const buffer = await createExcelBuffer([
        ['barcode', 'price', 'stock'],
        ['7801234567890', 2000, 100],
      ]);

      const existingProduct = { ...mockProduct };
      mockProductRepo.findOne.mockResolvedValue(existingProduct);
      mockProductRepo.save.mockResolvedValue({ ...existingProduct, price: 2000, stock: 100 });

      const result = await service.importFromExcel(tenantId, buffer);

      expect(result.updated).toBe(1);
      expect(result.errors).toHaveLength(0);
      expect(mockProductRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ price: 2000, stock: 100 }),
      );
    });

    it('should report error for missing barcode', async () => {
      const buffer = await createExcelBuffer([
        ['barcode', 'price', 'stock'],
        ['', 2000, 100],
      ]);

      const result = await service.importFromExcel(tenantId, buffer);

      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        row: 2,
        message: 'Código de barras es requerido',
      });
    });

    it('should report error for invalid price (zero)', async () => {
      const buffer = await createExcelBuffer([
        ['barcode', 'price', 'stock'],
        ['7801234567890', 0, 50],
      ]);

      const result = await service.importFromExcel(tenantId, buffer);

      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        row: 2,
        message: 'Precio debe ser un número positivo',
      });
    });

    it('should report error for negative price', async () => {
      const buffer = await createExcelBuffer([
        ['barcode', 'price', 'stock'],
        ['7801234567890', -500, 50],
      ]);

      const result = await service.importFromExcel(tenantId, buffer);

      expect(result.updated).toBe(0);
      expect(result.errors[0].message).toBe('Precio debe ser un número positivo');
    });

    it('should report error for negative stock', async () => {
      const buffer = await createExcelBuffer([
        ['barcode', 'price', 'stock'],
        ['7801234567890', 1500, -10],
      ]);

      const result = await service.importFromExcel(tenantId, buffer);

      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        row: 2,
        message: 'Stock debe ser un número no negativo',
      });
    });

    it('should report error for barcode not found in tenant', async () => {
      const buffer = await createExcelBuffer([
        ['barcode', 'price', 'stock'],
        ['9999999999999', 1500, 50],
      ]);

      mockProductRepo.findOne.mockResolvedValue(null);

      const result = await service.importFromExcel(tenantId, buffer);

      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('9999999999999');
      expect(result.errors[0].message).toContain('no encontrado');
    });

    it('should handle mixed valid and invalid rows', async () => {
      const buffer = await createExcelBuffer([
        ['barcode', 'price', 'stock'],
        ['7801234567890', 2000, 100],
        ['', 1500, 50],
        ['9999999999999', 1500, 50],
      ]);

      mockProductRepo.findOne
        .mockResolvedValueOnce({ ...mockProduct })
        .mockResolvedValueOnce(null);
      mockProductRepo.save.mockResolvedValue({ ...mockProduct, price: 2000, stock: 100 });

      const result = await service.importFromExcel(tenantId, buffer);

      expect(result.updated).toBe(1);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].row).toBe(3);
      expect(result.errors[1].row).toBe(4);
    });

    it('should report error for non-numeric price', async () => {
      const buffer = await createExcelBuffer([
        ['barcode', 'price', 'stock'],
        ['7801234567890', 'abc', 50],
      ]);

      const result = await service.importFromExcel(tenantId, buffer);

      expect(result.updated).toBe(0);
      expect(result.errors[0].message).toBe('Precio debe ser un número positivo');
    });

    it('should handle stock of zero as valid', async () => {
      const buffer = await createExcelBuffer([
        ['barcode', 'price', 'stock'],
        ['7801234567890', 1500, 0],
      ]);

      mockProductRepo.findOne.mockResolvedValue({ ...mockProduct });
      mockProductRepo.save.mockResolvedValue({ ...mockProduct, price: 1500, stock: 0 });

      const result = await service.importFromExcel(tenantId, buffer);

      expect(result.updated).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should return zero updated for empty file (header only)', async () => {
      const buffer = await createExcelBuffer([
        ['barcode', 'price', 'stock'],
      ]);

      const result = await service.importFromExcel(tenantId, buffer);

      expect(result.updated).toBe(0);
      expect(result.errors).toHaveLength(0);
    });
  });
});
