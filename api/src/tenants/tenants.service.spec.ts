import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantConfig } from '../entities/tenant-config.entity';
import { Subscription } from '../entities/subscription.entity';
import { SiiProvider, SubscriptionPlan, SubscriptionStatus } from '../entities/enums';

describe('TenantsService', () => {
  let service: TenantsService;
  let configFindOne: jest.Mock;
  let configSave: jest.Mock;
  let subFindOne: jest.Mock;

  const tenantId = 'tenant-uuid-1';

  const mockConfig: TenantConfig = {
    id: 'config-uuid-1',
    tenant_id: tenantId,
    sii_enabled: false,
    sii_provider: null,
    sii_api_key: null,
    sii_rut_emisor: null,
    sii_sandbox_mode: true,
    printer_enabled: false,
    updated_at: new Date(),
    tenant: null as any,
  };

  const mockSubscription: Subscription = {
    id: 'sub-uuid-1',
    tenant_id: tenantId,
    plan: SubscriptionPlan.BASICO,
    start_date: new Date('2024-01-01'),
    end_date: new Date('2025-12-31'),
    status: SubscriptionStatus.ACTIVA,
    tenant: null as any,
  };

  beforeEach(async () => {
    configFindOne = jest.fn();
    configSave = jest.fn();
    subFindOne = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        {
          provide: getRepositoryToken(TenantConfig),
          useValue: { findOne: configFindOne, save: configSave },
        },
        {
          provide: getRepositoryToken(Subscription),
          useValue: { findOne: subFindOne },
        },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
  });

  describe('getConfig', () => {
    it('should return tenant config when found', async () => {
      configFindOne.mockResolvedValue(mockConfig);
      const result = await service.getConfig(tenantId);
      expect(result).toEqual(mockConfig);
      expect(configFindOne).toHaveBeenCalledWith({
        where: { tenant_id: tenantId },
      });
    });

    it('should throw NotFoundException when config not found', async () => {
      configFindOne.mockResolvedValue(null);
      await expect(service.getConfig(tenantId)).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateSiiConfig', () => {
    it('should update SII config fields', async () => {
      const updated = {
        ...mockConfig,
        sii_enabled: true,
        sii_provider: SiiProvider.HAULMER,
        sii_api_key: 'test-key',
        sii_rut_emisor: '12345678-9',
        sii_sandbox_mode: false,
      };
      configFindOne.mockResolvedValue({ ...mockConfig });
      configSave.mockResolvedValue(updated);

      const result = await service.updateSiiConfig(tenantId, {
        sii_enabled: true,
        sii_provider: SiiProvider.HAULMER,
        sii_api_key: 'test-key',
        sii_rut_emisor: '12345678-9',
        sii_sandbox_mode: false,
      });

      expect(result.sii_enabled).toBe(true);
      expect(result.sii_provider).toBe(SiiProvider.HAULMER);
      expect(configSave).toHaveBeenCalled();
    });

    it('should only update provided fields', async () => {
      configFindOne.mockResolvedValue({ ...mockConfig });
      configSave.mockImplementation(async (entity: any) => entity);

      const result = await service.updateSiiConfig(tenantId, {
        sii_enabled: true,
      });

      expect(result.sii_enabled).toBe(true);
      expect(result.sii_provider).toBeNull();
      expect(result.sii_api_key).toBeNull();
    });
  });

  describe('updatePrinterConfig', () => {
    it('should update printer_enabled', async () => {
      const updated = { ...mockConfig, printer_enabled: true };
      configFindOne.mockResolvedValue({ ...mockConfig });
      configSave.mockResolvedValue(updated);

      const result = await service.updatePrinterConfig(tenantId, {
        printer_enabled: true,
      });

      expect(result.printer_enabled).toBe(true);
      expect(configSave).toHaveBeenCalled();
    });
  });

  describe('getSubscription', () => {
    it('should return subscription when found', async () => {
      subFindOne.mockResolvedValue(mockSubscription);
      const result = await service.getSubscription(tenantId);
      expect(result).toEqual(mockSubscription);
      expect(subFindOne).toHaveBeenCalledWith({
        where: { tenant_id: tenantId },
      });
    });

    it('should throw NotFoundException when subscription not found', async () => {
      subFindOne.mockResolvedValue(null);
      await expect(service.getSubscription(tenantId)).rejects.toThrow(NotFoundException);
    });
  });
});
