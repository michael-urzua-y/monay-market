import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SiiService, MAX_RETRIES } from './sii.service';
import { TenantConfig } from '../entities/tenant-config.entity';
import { Sale } from '../entities/sale.entity';
import { Boleta } from '../entities/boleta.entity';
import { BoletaStatus, SiiProvider } from '../entities/enums';
import { HaulmerProvider } from './providers/haulmer.provider';
import { OpenFacturaProvider } from './providers/openfactura.provider';
import { FacturacionClProvider } from './providers/facturacion-cl.provider';
import {
  SiiCredentialError,
  SiiEmitResult,
} from './interfaces/sii-provider.interface';

describe('SiiService', () => {
  let service: SiiService;
  let configRepo: jest.Mocked<Repository<TenantConfig>>;
  let saleRepo: jest.Mocked<Repository<Sale>>;
  let boletaRepo: jest.Mocked<Repository<Boleta>>;
  let haulmerProvider: jest.Mocked<HaulmerProvider>;

  const tenantId = '11111111-1111-1111-1111-111111111111';
  const saleId = '22222222-2222-2222-2222-222222222222';

  const mockConfig = (overrides: Partial<TenantConfig> = {}): TenantConfig =>
    ({
      id: 'cfg-1',
      tenant_id: tenantId,
      sii_enabled: true,
      sii_provider: SiiProvider.HAULMER,
      sii_api_key: 'test-api-key',
      sii_rut_emisor: '76.000.000-0',
      sii_sandbox_mode: true,
      printer_enabled: false,
      updated_at: new Date(),
      ...overrides,
    }) as TenantConfig;

  const mockSale = (overrides: Partial<Sale> = {}): Sale =>
    ({
      id: saleId,
      tenant_id: tenantId,
      user_id: 'user-1',
      total: 11900,
      payment_method: 'efectivo',
      amount_received: 15000,
      change_amount: 3100,
      boleta_status: BoletaStatus.NO_APLICA,
      created_at: new Date('2024-01-15T10:00:00Z'),
      lines: [
        {
          id: 'line-1',
          sale_id: saleId,
          product_id: 'prod-1',
          product_name: 'Coca-Cola 1.5L',
          unit_price: 1500,
          quantity: 2,
          subtotal: 3000,
        },
        {
          id: 'line-2',
          sale_id: saleId,
          product_id: 'prod-2',
          product_name: 'Pan molde',
          unit_price: 2900,
          quantity: 1,
          subtotal: 2900,
        },
      ],
      ...overrides,
    }) as Sale;

  const mockEmitResult: SiiEmitResult = {
    folio: 'F-12345',
    timbre_electronico: '<TED>...</TED>',
    pdf_url: 'https://sii.example.com/boleta/12345.pdf',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SiiService,
        {
          provide: getRepositoryToken(TenantConfig),
          useValue: {
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Sale),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Boleta),
          useValue: {
            create: jest.fn((data) => data),
            save: jest.fn((data) => ({ id: 'boleta-1', ...data })),
          },
        },
        {
          provide: HaulmerProvider,
          useValue: { providerName: SiiProvider.HAULMER, emitBoleta: jest.fn() },
        },
        {
          provide: OpenFacturaProvider,
          useValue: { providerName: SiiProvider.OPENFACTURA, emitBoleta: jest.fn() },
        },
        {
          provide: FacturacionClProvider,
          useValue: { providerName: SiiProvider.FACTURACION_CL, emitBoleta: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<SiiService>(SiiService);
    configRepo = module.get(getRepositoryToken(TenantConfig));
    saleRepo = module.get(getRepositoryToken(Sale));
    boletaRepo = module.get(getRepositoryToken(Boleta));
    haulmerProvider = module.get(HaulmerProvider);

    // Disable delay in tests
    jest.spyOn(service, 'delay').mockResolvedValue(undefined);
  });

  describe('emitBoleta — SII disabled', () => {
    it('should return no_aplica when SII is disabled', async () => {
      configRepo.findOne.mockResolvedValue(mockConfig({ sii_enabled: false }));

      const result = await service.emitBoleta(tenantId, saleId);

      expect(result.boleta_status).toBe(BoletaStatus.NO_APLICA);
      expect(haulmerProvider.emitBoleta).not.toHaveBeenCalled();
      expect(saleRepo.update).not.toHaveBeenCalled();
    });

    it('should return no_aplica when config not found', async () => {
      configRepo.findOne.mockResolvedValue(null);

      const result = await service.emitBoleta(tenantId, saleId);

      expect(result.boleta_status).toBe(BoletaStatus.NO_APLICA);
      expect(haulmerProvider.emitBoleta).not.toHaveBeenCalled();
    });
  });

  describe('emitBoleta — SII enabled, success', () => {
    it('should emit boleta and return emitida on success', async () => {
      configRepo.findOne.mockResolvedValue(mockConfig());
      saleRepo.findOne.mockResolvedValue(mockSale());
      haulmerProvider.emitBoleta.mockResolvedValue(mockEmitResult);

      const result = await service.emitBoleta(tenantId, saleId);

      expect(result.boleta_status).toBe(BoletaStatus.EMITIDA);
      expect(result.boleta).toBeDefined();
      expect(result.boleta?.folio).toBe('F-12345');
      expect(result.boleta?.timbre_electronico).toBe('<TED>...</TED>');
      expect(result.boleta?.pdf_url).toBe(
        'https://sii.example.com/boleta/12345.pdf',
      );
      expect(saleRepo.update).toHaveBeenCalledWith(saleId, {
        boleta_status: BoletaStatus.EMITIDA,
      });
      expect(boletaRepo.save).toHaveBeenCalled();
    });

    it('should send correct sale data to provider', async () => {
      configRepo.findOne.mockResolvedValue(mockConfig());
      const sale = mockSale({ total: 11900 });
      saleRepo.findOne.mockResolvedValue(sale);
      haulmerProvider.emitBoleta.mockResolvedValue(mockEmitResult);

      await service.emitBoleta(tenantId, saleId);

      expect(haulmerProvider.emitBoleta).toHaveBeenCalledWith(
        'test-api-key',
        expect.objectContaining({
          sale_id: saleId,
          rut_emisor: '76.000.000-0',
          monto_total: 11900,
          monto_neto: 10000, // 11900 / 1.19 = 10000
          iva: 1900, // 11900 - 10000 = 1900
          items: expect.arrayContaining([
            expect.objectContaining({ nombre: 'Coca-Cola 1.5L' }),
          ]),
        }),
        true, // sandbox
      );
    });
  });

  describe('emitBoleta — SII enabled, failure after retries', () => {
    it('should set pendiente after all retries fail', async () => {
      configRepo.findOne.mockResolvedValue(mockConfig());
      saleRepo.findOne.mockResolvedValue(mockSale());
      haulmerProvider.emitBoleta.mockRejectedValue(
        new Error('Connection timeout'),
      );

      const result = await service.emitBoleta(tenantId, saleId);

      expect(result.boleta_status).toBe(BoletaStatus.PENDIENTE);
      expect(result.error).toContain('No se pudo emitir');
      expect(haulmerProvider.emitBoleta).toHaveBeenCalledTimes(MAX_RETRIES);
      expect(saleRepo.update).toHaveBeenCalledWith(saleId, {
        boleta_status: BoletaStatus.PENDIENTE,
      });
    });
  });

  describe('emitBoleta — credential error', () => {
    it('should set error status on credential error without retrying', async () => {
      configRepo.findOne.mockResolvedValue(mockConfig());
      saleRepo.findOne.mockResolvedValue(mockSale());
      haulmerProvider.emitBoleta.mockRejectedValue(
        new SiiCredentialError('API key inválida'),
      );

      const result = await service.emitBoleta(tenantId, saleId);

      expect(result.boleta_status).toBe(BoletaStatus.ERROR);
      expect(result.error).toContain('credenciales');
      // Credential errors should NOT be retried
      expect(haulmerProvider.emitBoleta).toHaveBeenCalledTimes(1);
      expect(saleRepo.update).toHaveBeenCalledWith(saleId, {
        boleta_status: BoletaStatus.ERROR,
      });
    });
  });

  describe('emitBoleta — sale not found', () => {
    it('should return error when sale not found', async () => {
      configRepo.findOne.mockResolvedValue(mockConfig());
      saleRepo.findOne.mockResolvedValue(null);

      const result = await service.emitBoleta(tenantId, saleId);

      expect(result.boleta_status).toBe(BoletaStatus.ERROR);
      expect(result.error).toContain('no encontrada');
    });
  });

  describe('emitBoleta — provider not configured', () => {
    it('should return error when provider is null', async () => {
      configRepo.findOne.mockResolvedValue(
        mockConfig({ sii_provider: null as any }),
      );
      saleRepo.findOne.mockResolvedValue(mockSale());

      const result = await service.emitBoleta(tenantId, saleId);

      expect(result.boleta_status).toBe(BoletaStatus.ERROR);
      expect(result.error).toContain('no configurado');
    });
  });

  describe('retryBoleta', () => {
    it('should retry when sale is pendiente', async () => {
      saleRepo.findOne
        .mockResolvedValueOnce(mockSale({ boleta_status: BoletaStatus.PENDIENTE }))
        // Second call from emitBoleta
        .mockResolvedValueOnce(mockSale({ boleta_status: BoletaStatus.PENDIENTE }));
      configRepo.findOne.mockResolvedValue(mockConfig());
      haulmerProvider.emitBoleta.mockResolvedValue(mockEmitResult);

      const result = await service.retryBoleta(tenantId, saleId);

      expect(result.boleta_status).toBe(BoletaStatus.EMITIDA);
    });

    it('should reject retry when sale is not pendiente', async () => {
      saleRepo.findOne.mockResolvedValue(
        mockSale({ boleta_status: BoletaStatus.EMITIDA }),
      );

      const result = await service.retryBoleta(tenantId, saleId);

      expect(result.error).toContain('pendiente');
      expect(haulmerProvider.emitBoleta).not.toHaveBeenCalled();
    });

    it('should return error when sale not found', async () => {
      saleRepo.findOne.mockResolvedValue(null);

      const result = await service.retryBoleta(tenantId, saleId);

      expect(result.boleta_status).toBe(BoletaStatus.ERROR);
      expect(result.error).toContain('no encontrada');
    });
  });

  describe('emitWithRetries', () => {
    it('should succeed on second attempt after first failure', async () => {
      haulmerProvider.emitBoleta
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValueOnce(mockEmitResult);

      const result = await service.emitWithRetries(
        haulmerProvider,
        'key',
        {} as any,
        true,
        3,
        0,
        5000,
      );

      expect(result).toEqual(mockEmitResult);
      expect(haulmerProvider.emitBoleta).toHaveBeenCalledTimes(2);
    });

    it('should throw after all retries exhausted', async () => {
      haulmerProvider.emitBoleta.mockRejectedValue(new Error('fail'));

      await expect(
        service.emitWithRetries(
          haulmerProvider,
          'key',
          {} as any,
          true,
          3,
          0,
          5000,
        ),
      ).rejects.toThrow('fail');

      expect(haulmerProvider.emitBoleta).toHaveBeenCalledTimes(3);
    });

    it('should not retry on credential error', async () => {
      haulmerProvider.emitBoleta.mockRejectedValue(
        new SiiCredentialError('bad key'),
      );

      await expect(
        service.emitWithRetries(
          haulmerProvider,
          'key',
          {} as any,
          true,
          3,
          0,
          5000,
        ),
      ).rejects.toThrow(SiiCredentialError);

      expect(haulmerProvider.emitBoleta).toHaveBeenCalledTimes(1);
    });
  });

  describe('buildSaleData', () => {
    it('should calculate IVA correctly (19%)', () => {
      const sale = mockSale({ total: 11900 });
      const config = mockConfig();

      const data = service.buildSaleData(sale, config);

      expect(data.monto_total).toBe(11900);
      expect(data.monto_neto).toBe(10000);
      expect(data.iva).toBe(1900);
      expect(data.monto_neto + data.iva).toBe(data.monto_total);
    });

    it('should include rut_emisor from config', () => {
      const sale = mockSale();
      const config = mockConfig({ sii_rut_emisor: '12.345.678-9' });

      const data = service.buildSaleData(sale, config);

      expect(data.rut_emisor).toBe('12.345.678-9');
    });

    it('should map sale lines to items', () => {
      const sale = mockSale();
      const config = mockConfig();

      const data = service.buildSaleData(sale, config);

      expect(data.items).toHaveLength(2);
      expect(data.items[0]).toEqual({
        nombre: 'Coca-Cola 1.5L',
        cantidad: 2,
        precio_unitario: 1500,
        subtotal: 3000,
      });
    });
  });
});
