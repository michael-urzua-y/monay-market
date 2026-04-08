import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TenantGuard } from './tenant.guard';
import { RolesGuard } from './roles.guard';

function createMockExecutionContext(overrides: {
  user?: any;
  params?: any;
  body?: any;
}): ExecutionContext {
  const request = {
    user: overrides.user,
    params: overrides.params ?? {},
    body: overrides.body ?? {},
  };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
      getNext: () => jest.fn(),
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn() as any,
    getType: () => 'http' as any,
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({} as any),
    switchToWs: () => ({} as any),
  } as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  it('should be defined and extend AuthGuard("jwt")', () => {
    const guard = new JwtAuthGuard();
    expect(guard).toBeDefined();
  });
});

describe('TenantGuard', () => {
  let guard: TenantGuard;

  beforeEach(() => {
    guard = new TenantGuard();
  });

  it('should allow access when user has tenant_id', () => {
    const ctx = createMockExecutionContext({
      user: { user_id: 'u1', role: 'dueno', tenant_id: 't1' },
    });

    expect(guard.canActivate(ctx)).toBe(true);

    const req = ctx.switchToHttp().getRequest();
    expect(req.tenant_id).toBe('t1');
  });

  it('should throw ForbiddenException when user is missing', () => {
    const ctx = createMockExecutionContext({ user: undefined });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when user has no tenant_id', () => {
    const ctx = createMockExecutionContext({
      user: { user_id: 'u1', role: 'dueno' },
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when param tenant_id differs from user tenant_id', () => {
    const ctx = createMockExecutionContext({
      user: { user_id: 'u1', role: 'dueno', tenant_id: 't1' },
      params: { tenant_id: 't2' },
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when body tenant_id differs from user tenant_id', () => {
    const ctx = createMockExecutionContext({
      user: { user_id: 'u1', role: 'dueno', tenant_id: 't1' },
      body: { tenant_id: 't2' },
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should allow when param tenant_id matches user tenant_id', () => {
    const ctx = createMockExecutionContext({
      user: { user_id: 'u1', role: 'dueno', tenant_id: 't1' },
      params: { tenant_id: 't1' },
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow when body tenant_id matches user tenant_id', () => {
    const ctx = createMockExecutionContext({
      user: { user_id: 'u1', role: 'dueno', tenant_id: 't1' },
      body: { tenant_id: 't1' },
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });
});

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('should allow access when no @Roles() decorator is set', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const ctx = createMockExecutionContext({
      user: { user_id: 'u1', role: 'cajero', tenant_id: 't1' },
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access when @Roles() has empty array', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);

    const ctx = createMockExecutionContext({
      user: { user_id: 'u1', role: 'cajero', tenant_id: 't1' },
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access when user role matches required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['dueno']);

    const ctx = createMockExecutionContext({
      user: { user_id: 'u1', role: 'dueno', tenant_id: 't1' },
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should allow access when user role is one of multiple required roles', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['dueno', 'cajero']);

    const ctx = createMockExecutionContext({
      user: { user_id: 'u1', role: 'cajero', tenant_id: 't1' },
    });

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('should throw ForbiddenException when user role does not match', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['dueno']);

    const ctx = createMockExecutionContext({
      user: { user_id: 'u1', role: 'cajero', tenant_id: 't1' },
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when user is missing', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['dueno']);

    const ctx = createMockExecutionContext({ user: undefined });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when user has no role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['dueno']);

    const ctx = createMockExecutionContext({
      user: { user_id: 'u1', tenant_id: 't1' },
    });

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });
});
