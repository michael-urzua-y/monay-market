import {
  Body,
  Controller,
  Get,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, TenantGuard, RolesGuard } from '../common/guards';
import { Roles, CurrentUser } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../entities/enums';
import { TenantsService } from './tenants.service';
import { UpdateSiiConfigDto } from './dto/update-sii-config.dto';
import { UpdatePrinterConfigDto } from './dto/update-printer-config.dto';

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

  @Patch('config/printer')
  @Roles(UserRole.DUENO)
  updatePrinterConfig(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdatePrinterConfigDto,
  ) {
    return this.tenantsService.updatePrinterConfig(user.tenant_id, dto);
  }

  @Get('/subscription')
  @Roles(UserRole.DUENO)
  getSubscription(@CurrentUser() user: JwtPayload) {
    return this.tenantsService.getSubscription(user.tenant_id);
  }
}
