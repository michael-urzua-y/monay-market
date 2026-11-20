import {
  Controller,
  Get,
  Header,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, TenantGuard, RolesGuard } from '../common/guards';
import { Roles, CurrentUser } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../entities/enums';
import { TenantsService } from './tenants.service';

@Controller('tenant')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
/** La configuración del negocio (boleta y tarjeta) la maneja el superadmin: ver AdminController. */
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  /** Claves de SumUp para la app de la caja. No se guardan en caché. */
  @Get('card-payment')
  @Roles(UserRole.CAJERO, UserRole.DUENO)
  @Header('Cache-Control', 'no-store')
  getCardPaymentCredentials(@CurrentUser() user: JwtPayload) {
    return this.tenantsService.getCardPaymentCredentials(user.tenant_id);
  }

  @Get('/subscription')
  @Roles(UserRole.DUENO)
  getSubscription(@CurrentUser() user: JwtPayload) {
    return this.tenantsService.getSubscription(user.tenant_id);
  }
}
