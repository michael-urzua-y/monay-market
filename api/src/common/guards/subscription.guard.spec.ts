import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SubscriptionGuard } from './subscription.guard';
import { SubscriptionPlan, SubscriptionStatus } from '../../entities/enums';

describe('SubscriptionGuard', () => {
  let guard: SubscriptionGuard;
  let subscriptionRepo: any;

  const createMockContext = (user: any): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as any;

  beforeEach(() => {
    subscriptionRepo = {
      findOne: jest.fn(),
    };
    guard = new SubscriptionGuard(subscriptionRepo);
  });

  it('should allow access when subscription is active and not expired', async () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);

    subscriptionRepo.findOne.mockResolvedValue({
      tenant_id: 'tenant-1',
      plan: SubscriptionPlan.BASICO,
      status: SubscriptionStatus.ACTIVA,
      end_date: futureDate,
    });

    const context = createMockContext({ tenant_id: 'tenant-1' });
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should throw ForbiddenException with SUBSCRIPTION_EXPIRED when status is expirada', async () => {
    subscriptionRepo.findOne.mockResolvedValue({
      tenant_id: 'tenant-1',
      plan: SubscriptionPlan.BASICO,
      status: SubscriptionStatus.EXPIRADA,
      end_date: new Date('2020-01-01'),
    });

    const context = createMockContext({ tenant_id: 'tenant-1' });
    try {
      await guard.canActivate(context);
      fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      const response = (e as ForbiddenException).getResponse();
      expect(response).toEqual({
        error: 'SUBSCRIPTION_EXPIRED',
        message: 'Su suscripción ha expirado',
      });
    }
  });

  it('should throw ForbiddenException when end_date has passed even if status is activa', async () => {
    subscriptionRepo.findOne.mockResolvedValue({
      tenant_id: 'tenant-1',
      plan: SubscriptionPlan.BASICO,
      status: SubscriptionStatus.ACTIVA,
      end_date: new Date('2020-01-01'),
    });

    const context = createMockContext({ tenant_id: 'tenant-1' });
    try {
      await guard.canActivate(context);
      fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      const response = (e as ForbiddenException).getResponse();
      expect(response).toEqual({
        error: 'SUBSCRIPTION_EXPIRED',
        message: 'Su suscripción ha expirado',
      });
    }
  });

  it('should throw ForbiddenException when no subscription found', async () => {
    subscriptionRepo.findOne.mockResolvedValue(null);
    const context = createMockContext({ tenant_id: 'tenant-1' });
    try {
      await guard.canActivate(context);
      fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
    }
  });

  it('should throw ForbiddenException when no tenant_id in user', async () => {
    const context = createMockContext({});
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});
