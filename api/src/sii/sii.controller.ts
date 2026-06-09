import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard, TenantGuard, RolesGuard } from '../common/guards';
import { Roles, CurrentUser } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../entities/enums';
import { SiiService, EmitBoletaResult } from './sii.service';

@Controller('sales')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class SiiController {
  constructor(private readonly siiService: SiiService) {}

  @Post(':id/retry-boleta')
  @Roles(UserRole.DUENO, UserRole.CAJERO)
  @HttpCode(HttpStatus.OK)
  async retryBoleta(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) saleId: string,
  ): Promise<EmitBoletaResult> {
    return this.siiService.retryBoleta(user.tenant_id, saleId);
  }
}
