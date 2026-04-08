import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user?.tenant_id) {
      throw new ForbiddenException('No tiene acceso a este recurso');
    }

    // Inject tenant_id at request level for easy access downstream
    request.tenant_id = user.tenant_id;

    // If a route param or body references a different tenant, block it
    const paramTenantId = request.params?.tenant_id;
    const bodyTenantId = request.body?.tenant_id;

    if (paramTenantId && paramTenantId !== user.tenant_id) {
      throw new ForbiddenException('No tiene acceso a este recurso');
    }

    if (bodyTenantId && bodyTenantId !== user.tenant_id) {
      throw new ForbiddenException('No tiene acceso a este recurso');
    }

    return true;
  }
}
