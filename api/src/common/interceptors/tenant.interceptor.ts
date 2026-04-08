import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Interceptor that injects tenant_id from the authenticated user
 * into the request object so that services can use it to filter queries.
 *
 * Usage: Services read `request.tenant_id` (set by TenantGuard)
 * to scope all database queries to the current tenant.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user?.tenant_id) {
      // Ensure tenant_id is always available at request level
      request.tenant_id = user.tenant_id;
    }

    return next.handle();
  }
}
