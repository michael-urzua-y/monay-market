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
import { Sale } from '../entities/sale.entity';

@Controller('sales')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class SalesController {
  constructor(
    private readonly salesService: SalesService,
    private readonly siiService: SiiService,
    private readonly receiptService: ReceiptService,
  ) {}

  @Post()
  @Roles('dueno', 'cajero')
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

    // Emit boleta asynchronously (outside the sale transaction)
    const boletaResult = await this.siiService.emitBoleta(
      user.tenant_id,
      result.sale.id,
    );
    result.sale.boleta_status = boletaResult.boleta_status;

    // Generate receipt data
    const receipt = await this.receiptService.generateReceipt(
      user.tenant_id,
      result.sale,
    );
    result.receipt = receipt;

    return result;
  }

  @Get()
  @Roles('dueno', 'cajero')
  async findAll(
    @CurrentUser() user: JwtPayload,
    @Query() filters: FilterSalesDto,
  ): Promise<Sale[]> {
    return this.salesService.findAll(user.tenant_id, filters);
  }

  @Post('close-register')
  @Roles('dueno', 'cajero')
  @HttpCode(HttpStatus.OK)
  async closeRegister(
    @CurrentUser() user: JwtPayload,
  ): Promise<CloseRegisterResult> {
    return this.salesService.closeRegister(user.tenant_id);
  }

  @Get(':id/receipt')
  @Roles('dueno', 'cajero')
  async getReceipt(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReceiptData> {
    const sale = await this.salesService.findOne(user.tenant_id, id);
    return this.receiptService.generateReceipt(user.tenant_id, sale);
  }

  @Get(':id')
  @Roles('dueno', 'cajero')
  async findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Sale> {
    return this.salesService.findOne(user.tenant_id, id);
  }
}
