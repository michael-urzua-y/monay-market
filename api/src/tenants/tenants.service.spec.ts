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
    sii_rut_autenticador: null,
    sii_codigo_sucursal: null,
    sii_clave_tributaria: null,
    sii_razon_social: null,
    sii_giro: null,
    sii_certificado_path: null,
    sii_certificado_password: null,
    sii_sandbox_mode: true,
    printer_enabled: false,
    card_payment_enabled: false,
    sumup_api_key: null,
    sumup_affiliate_key: null,
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
      configFindOne.mockResolvedValue({
        ...mockConfig,
        sii_api_key: 'secret-api-key',
        sii_certificado_path: '/private/cert.pfx',
        sii_certificado_password: 'secret-password',
      });
      const result = await service.getConfig(tenantId);
      expect(result).toEqual(
        expect.objectContaining({
          ...mockConfig,
          sii_api_key: 'configured',
          sii_clave_tributaria: null,
          sii_certificado_path: 'configured',
          sii_certificado_password: null,
        }),
      );
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
        sii_provider: SiiProvider.API_GATEWAY,
        sii_api_key: 'test-key',
        sii_rut_emisor: '12.345.678-5',
        sii_rut_autenticador: '11.111.111-1',
        sii_codigo_sucursal: 2,
        sii_sandbox_mode: false,
      };
      configFindOne.mockResolvedValue({ ...mockConfig });
      configSave.mockResolvedValue(updated);

      const result = await service.updateSiiConfig(tenantId, {
        sii_enabled: true,
        sii_api_key: 'test-key',
        sii_rut_emisor: '12.345.678-5',
        sii_rut_autenticador: '11.111.111-1',
        sii_codigo_sucursal: 2,
        sii_sandbox_mode: false,
      });

      expect(result.sii_enabled).toBe(true);
      expect(result.sii_provider).toBe(SiiProvider.API_GATEWAY);
      expect(configSave).toHaveBeenCalled();
    });

    it('should only update provided fields', async () => {
      configFindOne.mockResolvedValue({ ...mockConfig });
      configSave.mockImplementation(async (entity: any) => entity);

      const result = await service.updateSiiConfig(tenantId, {
        sii_enabled: true,
      });

      expect(result.sii_enabled).toBe(true);
      // El proveedor queda siempre en API Gateway, aunque no se envíe
      expect(result.sii_provider).toBe(SiiProvider.API_GATEWAY);
      expect(result.sii_api_key).toBeNull();
    });
  });

  describe('getConfig — claves de SumUp', () => {
    it('enmascara las claves de SumUp como configured', async () => {
      configFindOne.mockResolvedValue({
        ...mockConfig,
        card_payment_enabled: true,
        sumup_api_key: 'sup_sk_secreto',
        sumup_affiliate_key: 'afiliado-secreto',
      });
      const result = await service.getConfig(tenantId);
      expect(result.card_payment_enabled).toBe(true);
      expect(result.sumup_api_key).toBe('configured');
      expect(result.sumup_affiliate_key).toBe('configured');
      expect(JSON.stringify(result)).not.toContain('sup_sk_secreto');
      expect(JSON.stringify(result)).not.toContain('afiliado-secreto');
    });

    it('devuelve null cuando las claves no están configuradas', async () => {
      configFindOne.mockResolvedValue({ ...mockConfig });
      const result = await service.getConfig(tenantId);
      expect(result.sumup_api_key).toBeNull();
      expect(result.sumup_affiliate_key).toBeNull();
    });
  });

  describe('updateCardPaymentConfig', () => {
    beforeEach(() => {
      configSave.mockImplementation(async (entity: any) => entity);
    });

    it('guarda las claves recortadas y responde enmascarado', async () => {
      configFindOne.mockResolvedValue({ ...mockConfig });

      const result = await service.updateCardPaymentConfig(tenantId, {
        card_payment_enabled: true,
        sumup_api_key: '  sup_sk_nueva  ',
        sumup_affiliate_key: 'afiliado-nuevo',
      });

      expect(configSave).toHaveBeenCalledWith(
        expect.objectContaining({
          card_payment_enabled: true,
          sumup_api_key: 'sup_sk_nueva',
          sumup_affiliate_key: 'afiliado-nuevo',
        }),
      );
      expect(result.card_payment_enabled).toBe(true);
      expect(result.sumup_api_key).toBe('configured');
      expect(result.sumup_affiliate_key).toBe('configured');
    });

    it('un texto vacío borra la clave', async () => {
      configFindOne.mockResolvedValue({
        ...mockConfig,
        sumup_api_key: 'sup_sk_vieja',
        sumup_affiliate_key: 'afiliado-viejo',
      });

      const result = await service.updateCardPaymentConfig(tenantId, {
        sumup_api_key: '   ',
      });

      expect(configSave).toHaveBeenCalledWith(
        expect.objectContaining({
          sumup_api_key: null,
          sumup_affiliate_key: 'afiliado-viejo',
        }),
      );
      expect(result.sumup_api_key).toBeNull();
      expect(result.sumup_affiliate_key).toBe('configured');
    });

    it('no toca las claves si no se envían', async () => {
      configFindOne.mockResolvedValue({
        ...mockConfig,
        sumup_api_key: 'sup_sk_vieja',
        sumup_affiliate_key: 'afiliado-viejo',
      });

      await service.updateCardPaymentConfig(tenantId, { card_payment_enabled: false });

      expect(configSave).toHaveBeenCalledWith(
        expect.objectContaining({
          card_payment_enabled: false,
          sumup_api_key: 'sup_sk_vieja',
          sumup_affiliate_key: 'afiliado-viejo',
        }),
      );
    });

    it('lanza NotFoundException si no hay configuración', async () => {
      configFindOne.mockResolvedValue(null);
      await expect(
        service.updateCardPaymentConfig(tenantId, { card_payment_enabled: true }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getCardPaymentCredentials', () => {
    it('entrega las claves cuando está activo y completo', async () => {
      configFindOne.mockResolvedValue({
        ...mockConfig,
        card_payment_enabled: true,
        sumup_api_key: 'sup_sk_secreto',
        sumup_affiliate_key: 'afiliado-secreto',
      });

      const result = await service.getCardPaymentCredentials(tenantId);

      expect(result).toEqual({
        enabled: true,
        access_token: 'sup_sk_secreto',
        affiliate_key: 'afiliado-secreto',
      });
      expect(configFindOne).toHaveBeenCalledWith({ where: { tenant_id: tenantId } });
    });

    it('no entrega claves si el cobro con tarjeta está desactivado', async () => {
      configFindOne.mockResolvedValue({
        ...mockConfig,
        card_payment_enabled: false,
        sumup_api_key: 'sup_sk_secreto',
        sumup_affiliate_key: 'afiliado-secreto',
      });

      await expect(service.getCardPaymentCredentials(tenantId)).resolves.toEqual({
        enabled: false,
        access_token: null,
        affiliate_key: null,
      });
    });

    it('no entrega claves si falta la clave de afiliado', async () => {
      configFindOne.mockResolvedValue({
        ...mockConfig,
        card_payment_enabled: true,
        sumup_api_key: 'sup_sk_secreto',
        sumup_affiliate_key: null,
      });

      await expect(service.getCardPaymentCredentials(tenantId)).resolves.toEqual({
        enabled: false,
        access_token: null,
        affiliate_key: null,
      });
    });

    it('no entrega claves si falta la clave de API', async () => {
      configFindOne.mockResolvedValue({
        ...mockConfig,
        card_payment_enabled: true,
        sumup_api_key: null,
        sumup_affiliate_key: 'afiliado-secreto',
      });

      await expect(service.getCardPaymentCredentials(tenantId)).resolves.toEqual({
        enabled: false,
        access_token: null,
        affiliate_key: null,
      });
    });

    it('lanza NotFoundException si no hay configuración', async () => {
      configFindOne.mockResolvedValue(null);
      await expect(service.getCardPaymentCredentials(tenantId)).rejects.toThrow(NotFoundException);
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
