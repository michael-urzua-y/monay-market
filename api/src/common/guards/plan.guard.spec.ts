import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlanGuard } from './plan.guard';
import { SubscriptionPlan, SubscriptionStatus } from '../../entities/enums';

describe('PlanGuard', () => {
  let guard: PlanGuard;
  let reflector: Reflector;
  let subscriptionRepo: any;

  const createMockContext = (user: any, subscription?: any): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user, subscription }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as any;

  beforeEach(() => {
    reflector = new Reflector();
    subscriptionRepo = {
      findOne: jest.fn(),
    };
    guard = new PlanGuard(reflector, subscriptionRepo);
  });

  it('should allow access when no @RequiredPlan decorator is present', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createMockContext({ tenant_id: 'tenant-1' });
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should allow access when subscription plan matches required plan', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['pro']);
    const subscription = {
      plan: SubscriptionPlan.PRO,
      status: SubscriptionStatus.ACTIVA,
    };
    const context = createMockContext({ tenant_id: 'tenant-1' }, subscription);
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
  });

  it('should throw ForbiddenException with PLAN_RESTRICTION when plan does not match', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['pro']);
    const subscription = {
      plan: SubscriptionPlan.BASICO,
      status: SubscriptionStatus.ACTIVA,
    };
    const context = createMockContext({ tenant_id: 'tenant-1' }, subscription);
    try {
      await guard.canActivate(context);
      fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      const response = (e as ForbiddenException).getResponse();
      expect(response).toEqual({
        error: 'PLAN_RESTRICTION',
        message: 'Esta función no está disponible en su plan actual',
      });
    }
  });

  it('should fetch subscription from DB when not on request', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['basico']);
    subscriptionRepo.findOne.mockResolvedValue({
      plan: SubscriptionPlan.BASICO,
      status: SubscriptionStatus.ACTIVA,
    });
    const context = createMockContext({ tenant_id: 'tenant-1' });
    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(subscriptionRepo.findOne).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-1' },
    });
  });

  it('should throw ForbiddenException when no subscription found', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['pro']);
    subscriptionRepo.findOne.mockResolvedValue(null);
    const context = createMockContext({ tenant_id: 'tenant-1' });
    try {
      await guard.canActivate(context);
      fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenException);
      const response = (e as ForbiddenException).getResponse();
      expect(response).toEqual({
        error: 'PLAN_RESTRICTION',
        message: 'Esta función no está disponible en su plan actual',
      });
    }
  });
});
