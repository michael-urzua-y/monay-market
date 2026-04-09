import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard, TenantGuard, RolesGuard } from '../common/guards';
import { Roles, CurrentUser } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { CartService, ValidatedCartResult, StockError } from './cart.service';
import { ValidateCartDto } from './dto/validate-cart.dto';

@Controller('cart')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Post('validate')
  @Roles('dueno', 'cajero')
  @HttpCode(HttpStatus.OK)
  async validate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ValidateCartDto,
  ): Promise<ValidatedCartResult | { error: string; details: StockError[] }> {
    const result = await this.cartService.validate(user.tenant_id, dto);

    if (!result.valid) {
      return {
        error: 'INSUFFICIENT_STOCK',
        details: result.errors,
      };
    }

    return result;
  }
}
