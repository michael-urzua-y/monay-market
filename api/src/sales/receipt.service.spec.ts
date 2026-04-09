import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ReceiptService } from './receipt.service';
import { Tenant } from '../entities/tenant.entity';
import { Sale } from '../entities/sale.entity';
import { PaymentMethod, BoletaStatus } from '../entities/enums';

describe('ReceiptService', () => {
  let service: ReceiptService;

  const tenantId = '11111111-1111-1111-1111-111111111111';

  const mockTenantRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReceiptService,
        { provide: getRepositoryToken(Tenant), useValue: mockTenantRepository },
      ],
    }).compile();

    service = module.get<ReceiptService>(ReceiptService);
  });

  const makeSale = (overrides: Partial<Sale> = {}): Sale =>
    ({
      id: 'sale-uuid',
      tenant_id: tenantId,
      user_id: 'user-uuid',
      total: 5000,
      payment_method: PaymentMethod.EFECTIVO,
      amount_received: 10000,
      change_amount: 5000,
      boleta_status: BoletaStatus.NO_APLICA,
      created_at: new Date('2024-06-15T14:30:00.000Z'),
      lines: [
        {
          id: 'line-1',
          sale_id: 'sale-uuid',
          product_id: 'prod-1',
          product_name: 'Coca Cola 1.5L',
          unit_price: 1500,
          quantity: 2,
          subtotal: 3000,
        },
        {
          id: 'line-2',
          sale_id: 'sale-uuid',
          product_id: 'prod-2',
          product_name: 'Pan Molde',
          unit_price: 2000,
          quantity: 1,
          subtotal: 2000,
        },
      ],
      boleta: null,
      ...overrides,
    }) as unknown as Sale;

  it('should generate receipt with store name from tenant', async () => {
    mockTenantRepository.findOne.mockResolvedValue({ id: tenantId, name: 'Almacén Don Pedro' });

    const sale = makeSale();
    const receipt = await service.generateReceipt(tenantId, sale);

    expect(receipt.store_name).toBe('Almacén Don Pedro');
    expect(mockTenantRepository.findOne).toHaveBeenCalledWith({ where: { id: tenantId } });
  });

  it('should fallback to "Tienda" when tenant not found', async () => {
    mockTenantRepository.findOne.mockResolvedValue(null);

    const sale = makeSale();
    const receipt = await service.generateReceipt(tenantId, sale);

    expect(receipt.store_name).toBe('Tienda');
  });

  it('should include formatted date from sale created_at', async () => {
    mockTenantRepository.findOne.mockResolvedValue({ id: tenantId, name: 'Mi Tienda' });

    const sale = makeSale({ created_at: new Date('2024-06-15T14:30:00.000Z') });
    const receipt = await service.generateReceipt(tenantId, sale);

    expect(receipt.date).toBe('2024-06-15T14:30:00.000Z');
  });

  it('should map sale lines to receipt items', async () => {
    mockTenantRepository.findOne.mockResolvedValue({ id: tenantId, name: 'Mi Tienda' });

    const sale = makeSale();
    const receipt = await service.generateReceipt(tenantId, sale);

    expect(receipt.items).toHaveLength(2);
    expect(receipt.items[0]).toEqual({
      name: 'Coca Cola 1.5L',
      quantity: 2,
      unit_price: 1500,
      subtotal: 3000,
    });
    expect(receipt.items[1]).toEqual({
      name: 'Pan Molde',
      quantity: 1,
      unit_price: 2000,
      subtotal: 2000,
    });
  });

  it('should include total from sale', async () => {
    mockTenantRepository.findOne.mockResolvedValue({ id: tenantId, name: 'Mi Tienda' });

    const sale = makeSale({ total: 7500 });
    const receipt = await service.generateReceipt(tenantId, sale);

    expect(receipt.total).toBe(7500);
  });

  it('should include payment_method', async () => {
    mockTenantRepository.findOne.mockResolvedValue({ id: tenantId, name: 'Mi Tienda' });

    const sale = makeSale({ payment_method: PaymentMethod.EFECTIVO });
    const receipt = await service.generateReceipt(tenantId, sale);

    expect(receipt.payment_method).toBe('efectivo');
  });

  it('should include amount_received and change_amount for efectivo', async () => {
    mockTenantRepository.findOne.mockResolvedValue({ id: tenantId, name: 'Mi Tienda' });

    const sale = makeSale({
      payment_method: PaymentMethod.EFECTIVO,
      amount_received: 10000,
      change_amount: 5000,
    });
    const receipt = await service.generateReceipt(tenantId, sale);

    expect(receipt.amount_received).toBe(10000);
    expect(receipt.change_amount).toBe(5000);
  });

  it('should set amount_received and change_amount to null for tarjeta', async () => {
    mockTenantRepository.findOne.mockResolvedValue({ id: tenantId, name: 'Mi Tienda' });

    const sale = makeSale({
      payment_method: PaymentMethod.TARJETA,
      amount_received: null,
      change_amount: null,
    });
    const receipt = await service.generateReceipt(tenantId, sale);

    expect(receipt.amount_received).toBeNull();
    expect(receipt.change_amount).toBeNull();
  });

  it('should include boleta_folio when boleta_status is emitida and boleta exists', async () => {
    mockTenantRepository.findOne.mockResolvedValue({ id: tenantId, name: 'Mi Tienda' });

    const sale = makeSale({
      boleta_status: BoletaStatus.EMITIDA,
      boleta: {
        id: 'boleta-uuid',
        sale_id: 'sale-uuid',
        tenant_id: tenantId,
        folio: 'F-12345',
        timbre_electronico: 'timbre',
        pdf_url: null,
        provider: 'haulmer' as any,
        emitted_at: new Date(),
      } as any,
    });
    const receipt = await service.generateReceipt(tenantId, sale);

    expect(receipt.boleta_folio).toBe('F-12345');
  });

  it('should set boleta_folio to null when boleta_status is not emitida', async () => {
    mockTenantRepository.findOne.mockResolvedValue({ id: tenantId, name: 'Mi Tienda' });

    const sale = makeSale({ boleta_status: BoletaStatus.PENDIENTE });
    const receipt = await service.generateReceipt(tenantId, sale);

    expect(receipt.boleta_folio).toBeNull();
  });

  it('should set boleta_folio to null when boleta_status is no_aplica', async () => {
    mockTenantRepository.findOne.mockResolvedValue({ id: tenantId, name: 'Mi Tienda' });

    const sale = makeSale({ boleta_status: BoletaStatus.NO_APLICA });
    const receipt = await service.generateReceipt(tenantId, sale);

    expect(receipt.boleta_folio).toBeNull();
  });

  it('should handle sale with empty lines', async () => {
    mockTenantRepository.findOne.mockResolvedValue({ id: tenantId, name: 'Mi Tienda' });

    const sale = makeSale({ lines: [] as any });
    const receipt = await service.generateReceipt(tenantId, sale);

    expect(receipt.items).toEqual([]);
  });
});
