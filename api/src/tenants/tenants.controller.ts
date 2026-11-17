import {
  Body,
  Controller,
  Get,
  Header,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, TenantGuard, RolesGuard } from '../common/guards';
import { Roles, CurrentUser } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../entities/enums';
import { TenantsService } from './tenants.service';
import { UpdateSiiConfigDto } from './dto/update-sii-config.dto';
import { UpdateCardPaymentConfigDto } from './dto/update-card-payment-config.dto';

@Controller('tenant')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('config')
  @Roles(UserRole.DUENO)
  getConfig(@CurrentUser() user: JwtPayload) {
    return this.tenantsService.getConfig(user.tenant_id);
  }

  @Patch('config/sii')
  @Roles(UserRole.DUENO)
  updateSiiConfig(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateSiiConfigDto,
  ) {
    return this.tenantsService.updateSiiConfig(user.tenant_id, dto);
  }

  @Patch('config/card-payment')
  @Roles(UserRole.DUENO)
  updateCardPaymentConfig(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateCardPaymentConfigDto,
  ) {
    return this.tenantsService.updateCardPaymentConfig(user.tenant_id, dto);
  }

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
