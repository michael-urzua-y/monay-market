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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FilterProductsDto } from './dto/filter-products.dto';

@Controller('products')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get('categories')
  @Roles('dueno', 'cajero')
  getCategories(@CurrentUser() user: JwtPayload) {
    return this.productsService.getCategories(user.tenant_id);
  }

  @Post()
  @Roles('dueno')
  create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateProductDto,
  ) {
    return this.productsService.create(user.tenant_id, dto);
  }

  @Post('import-excel')
  @Roles('dueno')
  @UseInterceptors(FileInterceptor('file'))
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
  @Roles('dueno')
  async downloadTemplate(@Res() res: Response) {
    const buffer = await this.productsService.generateTemplate();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename=Plantilla_Importacion_Productos.xlsx',
    });
    res.send(buffer);
  }

  @Get()
  @Roles('dueno', 'cajero')
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query() filters: FilterProductsDto,
  ) {
    return this.productsService.findAll(user.tenant_id, filters);
  }

  @Get('lookup-barcode/:code')
  @Roles('dueno', 'cajero')
  lookupBarcode(@Param('code') code: string) {
    return this.productsService.lookupBarcode(code);
  }

  @Get(':id')
  @Roles('dueno', 'cajero')
  findOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productsService.findOne(user.tenant_id, id);
  }

  @Patch(':id')
  @Roles('dueno')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productsService.update(user.tenant_id, id, dto);
  }

  @Delete(':id')
  @Roles('dueno')
  remove(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.productsService.softDelete(user.tenant_id, id);
  }
}
