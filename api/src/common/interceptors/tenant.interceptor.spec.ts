import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { TenantInterceptor } from './tenant.interceptor';

function createContext(user: any): ExecutionContext {
  const request: any = { user };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('TenantInterceptor', () => {
  let interceptor: TenantInterceptor;
  let mockCallHandler: CallHandler;

  beforeEach(() => {
    interceptor = new TenantInterceptor();
    mockCallHandler = { handle: () => of('test') };
  });

  it('should set request.tenant_id from user.tenant_id', (done) => {
    const user = { user_id: 'u1', role: 'dueno', tenant_id: 't1' };
    const ctx = createContext(user);

    interceptor.intercept(ctx, mockCallHandler).subscribe(() => {
      const req = ctx.switchToHttp().getRequest();
      expect(req.tenant_id).toBe('t1');
      done();
    });
  });

  it('should not set request.tenant_id when user is missing', (done) => {
    const ctx = createContext(undefined);

    interceptor.intercept(ctx, mockCallHandler).subscribe(() => {
      const req = ctx.switchToHttp().getRequest();
      expect(req.tenant_id).toBeUndefined();
      done();
    });
  });

  it('should not set request.tenant_id when user has no tenant_id', (done) => {
    const ctx = createContext({ user_id: 'u1', role: 'dueno' });

    interceptor.intercept(ctx, mockCallHandler).subscribe(() => {
      const req = ctx.switchToHttp().getRequest();
      expect(req.tenant_id).toBeUndefined();
      done();
    });
  });
});
