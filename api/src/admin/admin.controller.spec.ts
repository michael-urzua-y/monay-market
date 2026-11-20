import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { SuperAdminGuard } from './superadmin.guard';
import { TenantsService } from '../tenants/tenants.service';

describe('AdminController: configuración de cada negocio', () => {
  const proto = AdminController.prototype;
  const tenantId = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

  function build() {
    const tenantsService = {
      getConfig: jest.fn().mockResolvedValue({ sii_enabled: true }),
      updateSiiConfig: jest.fn().mockResolvedValue({ sii_sandbox_mode: false }),
      updateCardPaymentConfig: jest.fn().mockResolvedValue({ card_payment_enabled: true }),
    };
    const controller = new AdminController(
      {} as AdminService,
      tenantsService as unknown as TenantsService,
    );
    return { controller, tenantsService };
  }

  it('todo el controlador exige superadmin', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminController)).toContain(SuperAdminGuard);
  });

  it('expone GET y PATCH de la configuración por negocio', () => {
    expect(Reflect.getMetadata(METHOD_METADATA, proto.getTenantConfig)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(PATH_METADATA, proto.getTenantConfig)).toBe('tenants/:id/config');
    expect(Reflect.getMetadata(METHOD_METADATA, proto.updateTenantSiiConfig)).toBe(RequestMethod.PATCH);
    expect(Reflect.getMetadata(PATH_METADATA, proto.updateTenantSiiConfig)).toBe('tenants/:id/config/sii');
    expect(Reflect.getMetadata(METHOD_METADATA, proto.updateTenantCardPaymentConfig)).toBe(RequestMethod.PATCH);
    expect(Reflect.getMetadata(PATH_METADATA, proto.updateTenantCardPaymentConfig)).toBe('tenants/:id/config/card-payment');
  });

  it('delega en TenantsService con el negocio de la URL', async () => {
    const { controller, tenantsService } = build();

    await controller.getTenantConfig(tenantId);
    await controller.updateTenantSiiConfig(tenantId, { sii_sandbox_mode: false });
    await controller.updateTenantCardPaymentConfig(tenantId, { card_payment_enabled: true });

    expect(tenantsService.getConfig).toHaveBeenCalledWith(tenantId);
    expect(tenantsService.updateSiiConfig).toHaveBeenCalledWith(tenantId, { sii_sandbox_mode: false });
    expect(tenantsService.updateCardPaymentConfig).toHaveBeenCalledWith(tenantId, { card_payment_enabled: true });
  });
});
