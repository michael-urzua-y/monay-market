import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { JwtAuthGuard, TenantGuard, RolesGuard } from '../common/guards';
import { Roles, CurrentUser } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { UserRole } from '../entities/enums';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FilterProductsDto } from './dto/filter-products.dto';
import { CreateProductReceptionDto } from './dto/create-product-reception.dto';
import { BulkDeleteProductsDto } from './dto/bulk-delete-products.dto';

@Controller('products')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('categories')
  @Roles(UserRole.DUENO, UserRole.CAJERO)
  getCategories(@CurrentUser() user: JwtPayload) {
    return this.productsService.getCategories(user.tenant_id);
  }

  @Post('categories')
  @Roles(UserRole.DUENO)
  createCategory(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name: string },
  ) {
    return this.productsService.createCategory(user.tenant_id, body.name);
  }

  @Delete('categories/:id')
  @Roles(UserRole.DUENO)
  deleteCategory(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productsService.deleteCategory(user.tenant_id, id);
  }

  @Post()
  @Roles(UserRole.DUENO)
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.create(user.tenant_id, dto);
  }

  @Post('granel')
  @Roles(UserRole.DUENO, UserRole.CAJERO)
  createBulkProduct(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.createBulkProduct(user.tenant_id, dto);
  }

  @Post('import-excel')
  @Roles(UserRole.DUENO)
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, callback) => {
      const isXlsx = file.originalname.toLowerCase().endsWith('.xlsx') &&
        file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      callback(isXlsx ? null : new BadRequestException('Solo se permiten archivos .xlsx'), isXlsx);
    },
  }))
  async importExcel(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Archivo Excel es requerido');
    }
    return this.productsService.importFromExcel(user.tenant_id, file.buffer);
  }

  @Get('import-template')
  @Roles(UserRole.DUENO)
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.productsService.generateTemplate();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename=Plantilla_Importacion_Productos.xlsx',
    });
    res.send(buffer);
  }

  @Get()
  @Roles(UserRole.DUENO, UserRole.CAJERO)
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() filters: FilterProductsDto,
  ) {
    return this.productsService.findAll(user.tenant_id, filters);
  }

  @Get('lookup-barcode/:code')
  @Roles(UserRole.DUENO, UserRole.CAJERO)
  lookupBarcode(@Param('code') code: string) {
    return this.productsService.lookupBarcode(code);
  }

  @Get(':id')
  @Roles(UserRole.DUENO, UserRole.CAJERO)
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productsService.findOne(user.tenant_id, id);
  }

  @Patch(':id')
  @Roles(UserRole.DUENO)
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(user.tenant_id, id, dto, user.user_id);
  }

  @Post(':id/receptions')
  @Roles(UserRole.DUENO, UserRole.CAJERO)
  createReception(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateProductReceptionDto,
  ) {
    return this.productsService.createReception(user.tenant_id, id, user.user_id, dto);
  }

  @Get(':id/price-history')
  @Roles(UserRole.DUENO)
  getPriceHistory(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productsService.getPriceHistory(user.tenant_id, id);
  }

  @Delete(':id')
  @Roles(UserRole.DUENO)
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productsService.softDelete(user.tenant_id, id);
  }

  @Post('bulk-delete')
  @Roles(UserRole.DUENO)
  bulkDelete(
    @CurrentUser() user: JwtPayload,
    @Body() dto: BulkDeleteProductsDto,
  ) {
    return this.productsService.bulkSoftDelete(user.tenant_id, dto.ids);
  }
}
