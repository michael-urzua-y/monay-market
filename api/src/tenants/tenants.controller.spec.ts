import { RequestMethod } from '@nestjs/common';
import { HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { UserRole } from '../entities/enums';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

describe('TenantsController', () => {
  const proto = TenantsController.prototype;
  const user = { tenant_id: 'tenant-uuid-1' } as any;

  describe('GET /tenant/card-payment', () => {
    const handler = proto.getCardPaymentCredentials;

    it('es un GET en card-payment, distinto de config y subscription', () => {
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('card-payment');
      expect(Reflect.getMetadata(PATH_METADATA, proto.getConfig)).toBe('config');
    });

    it('lo pueden usar el cajero y el dueño', () => {
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([UserRole.CAJERO, UserRole.DUENO]);
    });

    it('responde con Cache-Control: no-store', () => {
      expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual(
        expect.arrayContaining([{ name: 'Cache-Control', value: 'no-store' }]),
      );
    });

    it('delega en el servicio con el tenant del usuario', async () => {
      const creds = { enabled: true, access_token: 'sup_sk_x', affiliate_key: 'af' };
      const service = { getCardPaymentCredentials: jest.fn().mockResolvedValue(creds) };
      const controller = new TenantsController(service as unknown as TenantsService);
      await expect(controller.getCardPaymentCredentials(user)).resolves.toEqual(creds);
      expect(service.getCardPaymentCredentials).toHaveBeenCalledWith('tenant-uuid-1');
    });
  });

  describe('PATCH /tenant/config/card-payment', () => {
    const handler = proto.updateCardPaymentConfig;

    it('es un PATCH solo para el dueño', () => {
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.PATCH);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('config/card-payment');
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([UserRole.DUENO]);
    });
  });
});
