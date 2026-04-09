import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { CartService } from './cart.service';
import { Product } from '../entities/product.entity';
import { ValidateCartDto } from './dto/validate-cart.dto';

describe('CartService', () => {
  let service: CartService;

  const tenantId = '11111111-1111-1111-1111-111111111111';

  const mockProducts: Partial<Product>[] = [
    {
      id: 'aaaa1111-1111-1111-1111-111111111111',
      tenant_id: tenantId,
      name: 'Coca-Cola 1.5L',
      price: 1500,
      stock: 20,
      active: true,
    },
    {
      id: 'bbbb2222-2222-2222-2222-222222222222',
      tenant_id: tenantId,
      name: 'Pan Molde',
      price: 2000,
      stock: 5,
      active: true,
    },
    {
      id: 'cccc3333-3333-3333-3333-333333333333',
      tenant_id: tenantId,
      name: 'Leche Entera 1L',
      price: 1200,
      stock: 0,
      active: true,
    },
  ];

  const mockProductRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        {
          provide: getRepositoryToken(Product),
          useValue: mockProductRepository,
        },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
    jest.clearAllMocks();
  });

  describe('validate', () => {
    it('should validate a cart with a single line and sufficient stock', async () => {
      mockProductRepository.findOne.mockResolvedValueOnce(mockProducts[0]);

      const dto: ValidateCartDto = {
        lines: [{ product_id: mockProducts[0].id!, quantity: 3 }],
      };

      const result = await service.validate(tenantId, dto);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.lines).toHaveLength(1);
      expect(result.lines[0]).toEqual({
        product_id: mockProducts[0].id,
        product_name: 'Coca-Cola 1.5L',
        unit_price: 1500,
        quantity: 3,
        subtotal: 4500,
        available_stock: 20,
      });
      expect(result.total).toBe(4500);
    });

    it('should validate a cart with multiple lines and calculate total correctly', async () => {
      mockProductRepository.findOne
        .mockResolvedValueOnce(mockProducts[0])
        .mockResolvedValueOnce(mockProducts[1]);

      const dto: ValidateCartDto = {
        lines: [
          { product_id: mockProducts[0].id!, quantity: 2 },
          { product_id: mockProducts[1].id!, quantity: 1 },
        ],
      };

      const result = await service.validate(tenantId, dto);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.lines).toHaveLength(2);
      expect(result.lines[0].subtotal).toBe(3000); // 2 × 1500
      expect(result.lines[1].subtotal).toBe(2000); // 1 × 2000
      expect(result.total).toBe(5000); // 3000 + 2000
    });

    it('should return INSUFFICIENT_STOCK error when quantity exceeds stock', async () => {
      mockProductRepository.findOne.mockResolvedValueOnce(mockProducts[1]);

      const dto: ValidateCartDto = {
        lines: [{ product_id: mockProducts[1].id!, quantity: 10 }],
      };

      const result = await service.validate(tenantId, dto);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        product_id: mockProducts[1].id,
        requested: 10,
        available: 5,
      });
    });

    it('should return error when requesting product with zero stock', async () => {
      mockProductRepository.findOne.mockResolvedValueOnce(mockProducts[2]);

      const dto: ValidateCartDto = {
        lines: [{ product_id: mockProducts[2].id!, quantity: 1 }],
      };

      const result = await service.validate(tenantId, dto);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        product_id: mockProducts[2].id,
        requested: 1,
        available: 0,
      });
    });

    it('should throw NotFoundException for non-existent product', async () => {
      mockProductRepository.findOne.mockResolvedValueOnce(null);

      const fakeId = 'dddd4444-4444-4444-4444-444444444444';
      const dto: ValidateCartDto = {
        lines: [{ product_id: fakeId, quantity: 1 }],
      };

      await expect(service.validate(tenantId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should collect multiple stock errors across lines', async () => {
      mockProductRepository.findOne
        .mockResolvedValueOnce(mockProducts[1])  // stock: 5
        .mockResolvedValueOnce(mockProducts[2]); // stock: 0

      const dto: ValidateCartDto = {
        lines: [
          { product_id: mockProducts[1].id!, quantity: 8 },
          { product_id: mockProducts[2].id!, quantity: 2 },
        ],
      };

      const result = await service.validate(tenantId, dto);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].product_id).toBe(mockProducts[1].id);
      expect(result.errors[1].product_id).toBe(mockProducts[2].id);
      // Still calculates subtotals and total even with errors
      expect(result.total).toBe(8 * 2000 + 2 * 1200);
    });

    it('should filter products by tenant_id and active status', async () => {
      mockProductRepository.findOne.mockResolvedValueOnce(mockProducts[0]);

      const dto: ValidateCartDto = {
        lines: [{ product_id: mockProducts[0].id!, quantity: 1 }],
      };

      await service.validate(tenantId, dto);

      expect(mockProductRepository.findOne).toHaveBeenCalledWith({
        where: {
          id: mockProducts[0].id,
          tenant_id: tenantId,
          active: true,
        },
      });
    });

    it('should handle exact stock quantity as valid', async () => {
      mockProductRepository.findOne.mockResolvedValueOnce(mockProducts[1]); // stock: 5

      const dto: ValidateCartDto = {
        lines: [{ product_id: mockProducts[1].id!, quantity: 5 }],
      };

      const result = await service.validate(tenantId, dto);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.total).toBe(10000); // 5 × 2000
    });
  });
});
