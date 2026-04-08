import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { Workbook } from 'exceljs';
import { Product } from '../entities/product.entity';
import { SaleLine } from '../entities/sale-line.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FilterProductsDto } from './dto/filter-products.dto';

export interface ImportResult {
  updated: number;
  errors: { row: number; message: string }[];
}

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(SaleLine)
    private readonly saleLineRepository: Repository<SaleLine>,
    private readonly httpService: HttpService,
  ) {}

  async create(tenantId: string, dto: CreateProductDto): Promise<Product> {
    if (dto.barcode) {
      await this.assertBarcodeUnique(tenantId, dto.barcode);
    }

    const product = this.productRepository.create({
      ...dto,
      tenant_id: tenantId,
      active: true,
    });

    return this.productRepository.save(product);
  }

  async findAll(
    tenantId: string,
    filters: FilterProductsDto,
  ): Promise<Product[]> {
    const where: any = { tenant_id: tenantId, active: true };

    if (filters.name) {
      where.name = ILike(`%${filters.name}%`);
    }
    if (filters.category_id) {
      where.category_id = filters.category_id;
    }
    if (filters.barcode) {
      where.barcode = filters.barcode;
    }

    return this.productRepository.find({
      where,
      order: { name: 'ASC' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id, tenant_id: tenantId },
    });

    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }

    return product;
  }

  async update(
    tenantId: string,
    id: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    const product = await this.findOne(tenantId, id);

    if (dto.barcode !== undefined && dto.barcode !== product.barcode) {
      if (dto.barcode !== null) {
        await this.assertBarcodeUnique(tenantId, dto.barcode, id);
      }
    }

    Object.assign(product, dto);
    return this.productRepository.save(product);
  }

  async softDelete(tenantId: string, id: string): Promise<void> {
    const product = await this.findOne(tenantId, id);

    const hasRecentSales = await this.hasRecentSales(product.id);
    if (hasRecentSales) {
      throw new BadRequestException({
        error: 'PRODUCT_HAS_RECENT_SALES',
        message:
          'No se puede eliminar un producto con ventas en los últimos 30 días',
      });
    }

    product.active = false;
    await this.productRepository.save(product);
  }

  async lookupBarcode(
    code: string,
  ): Promise<{ barcode: string; name: string | null; category_suggestion: string | null }> {
    try {
      const url = `https://world.openfoodfacts.org/api/v2/product/${code}.json`;
      const response = await firstValueFrom(
        this.httpService.get(url, { timeout: 5000 }),
      );

      if (response.data?.status === 1 && response.data?.product) {
        const p = response.data.product;
        const name: string | null = p.product_name || null;
        let categorySuggestion: string | null = null;

        if (p.categories_tags && p.categories_tags.length > 0) {
          const lastTag: string = p.categories_tags[p.categories_tags.length - 1];
          categorySuggestion = lastTag.replace(/^[a-z]{2}:/, '');
        }

        return { barcode: code, name, category_suggestion: categorySuggestion };
      }

      return { barcode: code, name: null, category_suggestion: null };
    } catch {
      return { barcode: code, name: null, category_suggestion: null };
    }
  }

  async importFromExcel(
    tenantId: string,
    buffer: Buffer,
  ): Promise<ImportResult> {
    const workbook = new Workbook();
    await workbook.xlsx.load(buffer as any);

    const worksheet = workbook.worksheets[0];
    if (!worksheet) {
      throw new BadRequestException({
        error: 'IMPORT_ERRORS',
        details: [{ row: 0, message: 'El archivo Excel no contiene hojas de trabajo' }],
      });
    }

    const errors: { row: number; message: string }[] = [];
    let updated = 0;

    const rows = worksheet.getSheetValues() as any[];
    // rows[0] is undefined (exceljs is 1-indexed), rows[1] is header
    for (let i = 2; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i;

      if (!row || (Array.isArray(row) && row.every((cell: any) => cell === null || cell === undefined || cell === ''))) {
        continue;
      }

      const barcode = row[1] != null ? String(row[1]).trim() : '';
      const priceRaw = row[2];
      const stockRaw = row[3];

      if (!barcode) {
        errors.push({ row: rowNumber, message: 'Código de barras es requerido' });
        continue;
      }

      const price = Number(priceRaw);
      if (Number.isNaN(price) || price <= 0) {
        errors.push({ row: rowNumber, message: 'Precio debe ser un número positivo' });
        continue;
      }

      const stock = Number(stockRaw);
      if (Number.isNaN(stock) || stock < 0) {
        errors.push({ row: rowNumber, message: 'Stock debe ser un número no negativo' });
        continue;
      }

      const product = await this.productRepository.findOne({
        where: { tenant_id: tenantId, barcode, active: true },
      });

      if (!product) {
        errors.push({ row: rowNumber, message: `Producto con código de barras '${barcode}' no encontrado` });
        continue;
      }

      product.price = Math.round(price);
      product.stock = Math.round(stock);
      await this.productRepository.save(product);
      updated++;
    }

    return { updated, errors };
  }

  private async assertBarcodeUnique(
    tenantId: string,
    barcode: string,
    excludeProductId?: string,
  ): Promise<void> {
    const query: any = { tenant_id: tenantId, barcode };
    const existing = await this.productRepository.findOne({ where: query });

    if (existing && existing.id !== excludeProductId) {
      throw new BadRequestException({
        error: 'BARCODE_DUPLICATE',
        message: 'El código de barras ya existe para este tenant',
      });
    }
  }

  private async hasRecentSales(productId: string): Promise<boolean> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const count = await this.saleLineRepository
      .createQueryBuilder('sl')
      .innerJoin('sl.sale', 'sale')
      .where('sl.product_id = :productId', { productId })
      .andWhere('sale.created_at >= :since', { since: thirtyDaysAgo })
      .getCount();

    return count > 0;
  }
}
