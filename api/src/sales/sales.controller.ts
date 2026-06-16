import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard, TenantGuard, RolesGuard } from '../common/guards';
import { Roles, CurrentUser } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { SalesService, SaleResult, CloseRegisterResult } from './sales.service';
import { SiiService } from '../sii/sii.service';
import { ReceiptService, ReceiptData } from './receipt.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { FilterSalesDto } from './dto/filter-sales.dto';
import { CloseRegisterDto } from './dto/close-register.dto';
import { Sale } from '../entities/sale.entity';
import { UserRole } from '../entities/enums';

@Controller('sales')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly siiService: SiiService,
    private readonly receiptService: ReceiptService,
  ) {}

  @Post()
  @Roles(UserRole.DUENO, UserRole.CAJERO)
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateSaleDto,
  ): Promise<SaleResult> {
    const result = await this.salesService.create(
      user.tenant_id,
      user.user_id,
      dto,
    );

    if (!result.idempotent_replay) {
      const boletaResult = await this.siiService.emitBoleta(
        user.tenant_id,
        result.sale.id,
      );
      result.sale.boleta_status = boletaResult.boleta_status;
      if (boletaResult.boleta) {
        result.sale.boleta = boletaResult.boleta;
      }
    }

    // Generate receipt data
    const receipt = await this.receiptService.generateReceipt(
      user.tenant_id,
      result.sale,
    );
    result.receipt = receipt;

    return result;
  }

  @Get()
  @Roles(UserRole.DUENO, UserRole.CAJERO)
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() filters: FilterSalesDto,
  ): Promise<Sale[]> {
    return this.salesService.findAll(
      user.tenant_id,
      filters,
      user.role,
      user.user_id,
    );
  }

  @Post('close-register')
  @Roles(UserRole.DUENO, UserRole.CAJERO)
  @HttpCode(HttpStatus.OK)
  async closeRegister(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CloseRegisterDto,
  ): Promise<CloseRegisterResult> {
    const userId = (user as any).id || user.user_id;
    return this.salesService.closeRegister(
      user.tenant_id,
      userId,
      dto.counted_efectivo,
    );
  }

  @Get('arqueos')
  @Roles(UserRole.DUENO)
  async getArqueos(
    @CurrentUser() user: JwtPayload,
    @Query('date_from') dateFrom?: string,
    @Query('date_to') dateTo?: string,
  ) {
    return this.salesService.getArqueos(user.tenant_id, dateFrom, dateTo);
  }

  @Get(':id/receipt')
  @Roles(UserRole.DUENO, UserRole.CAJERO)
  async getReceipt(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReceiptData> {
    const sale = await this.salesService.findOne(
      user.tenant_id,
      id,
      user.role,
      user.user_id,
    );
    return this.receiptService.generateReceipt(user.tenant_id, sale);
  }

  @Get(':id')
  @Roles(UserRole.DUENO, UserRole.CAJERO)
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Sale> {
    return this.salesService.findOne(
      user.tenant_id,
      id,
      user.role,
      user.user_id,
    );
  }
}
