import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { Workbook } from 'exceljs';
import { Product } from '../entities/product.entity';
import { SaleLine } from '../entities/sale-line.entity';
import { Category } from '../entities/category.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FilterProductsDto } from './dto/filter-products.dto';

export interface ImportResult {
  updated: number;
  errors: { row: number; message: string }[];
}

type BarcodeLookupMatch = {
  name: string | null;
  category_suggestion: string | null;
};

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(SaleLine)
    private readonly saleLineRepository: Repository<SaleLine>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async getCategories(tenantId: string): Promise<Category[]> {
    return this.categoryRepository.find({
      where: { tenant_id: tenantId },
      order: { name: 'ASC' },
    });
  }

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
      relations: ['category'],
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
    const sources: Array<() => Promise<BarcodeLookupMatch | null>> = [
      () => this.lookupOpenFoodFacts(code),
      () => this.lookupUpcItemDb(code),
      () => this.lookupOpenBeautyFacts(code),
      () => this.lookupUpcDatabase(code),
      () => this.lookupJustBc(code),
    ];

    for (const source of sources) {
      const match = await source();
      if (match) {
        return { barcode: code, ...match };
      }
    }

    return { barcode: code, name: null, category_suggestion: null };
  }

  async generateTemplate(): Promise<Buffer> {
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Productos');

    // Definir las columnas exactas que tu sistema necesita
    worksheet.columns = [
      { header: 'Código de Barras (Obligatorio)', key: 'barcode', width: 30 },
      { header: 'Precio CLP (Obligatorio)', key: 'price', width: 25 },
      { header: 'Stock Inicial (Obligatorio)', key: 'stock', width: 25 },
    ];

    // Poner negrita en la cabecera
    worksheet.getRow(1).font = { bold: true };

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(arrayBuffer);
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

    // Validar que el archivo tenga al menos nuestra cabecera con 3 columnas
    const headerRow = rows[1];
    if (!headerRow || headerRow.length < 4) { // length < 4 porque el índice 0 en exceljs viene vacío
      throw new BadRequestException({
        error: 'IMPORT_ERRORS',
        details: [{ row: 1, message: 'Formato incorrecto. Por favor, descargue y utilice la plantilla oficial.' }],
      });
    }

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
      product.stock = this.roundQuantity(stock);
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

  private roundQuantity(value: number): number {
    return Math.round(value * 1000) / 1000;
  }

  private async lookupOpenFoodFacts(code: string): Promise<BarcodeLookupMatch | null> {
    const data = await this.requestBarcodeLookup(
      this.getLookupUrl(
        'BARCODE_LOOKUP_OPENFOODFACTS_URL',
        'https://world.openfoodfacts.org/api/v2/product/{code}.json',
        code,
      ),
    );

    if (data?.status !== 1 || !data?.product) {
      return null;
    }

    return {
      name: data.product.product_name || null,
      category_suggestion: this.extractCategoryTag(data.product.categories_tags),
    };
  }

  private async lookupUpcItemDb(code: string): Promise<BarcodeLookupMatch | null> {
    const data = await this.requestBarcodeLookup(
      this.getLookupUrl(
        'BARCODE_LOOKUP_UPCITEMDB_URL',
        'https://api.upcitemdb.com/prod/trial/lookup?upc={code}',
        code,
      ),
    );

    if (!data?.items?.length) {
      return null;
    }

    const item = data.items[0];
    return {
      name: item.title || null,
      category_suggestion: this.extractDelimitedCategory(item.category),
    };
  }

  private async lookupOpenBeautyFacts(code: string): Promise<BarcodeLookupMatch | null> {
    const data = await this.requestBarcodeLookup(
      this.getLookupUrl(
        'BARCODE_LOOKUP_OPENBEAUTYFACTS_URL',
        'https://world.openbeautyfacts.org/api/v2/product/{code}.json',
        code,
      ),
    );

    if (data?.status !== 1 || !data?.product) {
      return null;
    }

    return {
      name: data.product.product_name || null,
      category_suggestion: this.extractCategoryTag(data.product.categories_tags),
    };
  }

  private async lookupUpcDatabase(code: string): Promise<BarcodeLookupMatch | null> {
    const data = await this.requestBarcodeLookup(
      this.getLookupUrl(
        'BARCODE_LOOKUP_UPCDATABASE_URL',
        'https://api.upcdatabase.org/product/{code}',
        code,
      ),
    );

    if (!data?.success || !data?.product) {
      return null;
    }

    return {
      name: data.product.title || null,
      category_suggestion: data.product.category || null,
    };
  }

  private async lookupJustBc(code: string): Promise<BarcodeLookupMatch | null> {
    const data = await this.requestBarcodeLookup(
      this.getLookupUrl(
        'BARCODE_LOOKUP_JUSTBC_URL',
        'https://www.justbc.com/api/barcode/{code}',
        code,
      ),
    );

    if (data?.result !== 1) {
      return null;
    }

    return {
      name: data.product_name || null,
      category_suggestion: null,
    };
  }

  private async requestBarcodeLookup(url: string): Promise<any | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(url, { timeout: 4000 }),
      );
      return response.data;
    } catch {
      return null;
    }
  }

  private getLookupUrl(key: string, fallback: string, code: string): string {
    const template = this.configService.get<string>(key) || fallback;
    return template.replace('{code}', encodeURIComponent(code));
  }

  private extractCategoryTag(tags?: string[]): string | null {
    if (!tags?.length) {
      return null;
    }

    const lastTag = tags[tags.length - 1];
    return lastTag.replace(/^[a-z]{2}:/, '') || null;
  }

  private extractDelimitedCategory(category?: string): string | null {
    if (!category) {
      return null;
    }

    const parts = category.split('>');
    return parts[parts.length - 1].trim() || null;
  }
}
