import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { Workbook } from 'exceljs';
import { Product } from '../entities/product.entity';
import { PriceHistory } from '../entities/price-history.entity';
import { SaleLine } from '../entities/sale-line.entity';
import { Category } from '../entities/category.entity';
import { ProductReception } from '../entities/product-reception.entity';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { FilterProductsDto } from './dto/filter-products.dto';
import { CreateProductReceptionDto } from './dto/create-product-reception.dto';

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
    @InjectRepository(PriceHistory)
    private readonly priceHistoryRepository: Repository<PriceHistory>,
    @InjectRepository(SaleLine)
    private readonly saleLineRepository: Repository<SaleLine>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  async getCategories(tenantId: string): Promise<Category[]> {
    return this.categoryRepository.find({
      where: { tenant_id: tenantId },
      order: { name: 'ASC' },
    });
  }

  async createCategory(tenantId: string, name: string): Promise<Category> {
    const trimmed = (name || '').trim();
    if (!trimmed) {
      throw new BadRequestException('El nombre de la categoría es obligatorio');
    }

    const existing = await this.categoryRepository.findOne({
      where: { tenant_id: tenantId, name: ILike(trimmed) },
    });
    if (existing) {
      throw new BadRequestException('Ya existe una categoría con ese nombre');
    }

    const category = this.categoryRepository.create({
      tenant_id: tenantId,
      name: trimmed,
    });
    return this.categoryRepository.save(category);
  }

  async deleteCategory(tenantId: string, categoryId: string): Promise<void> {
    const category = await this.categoryRepository.findOne({
      where: { id: categoryId, tenant_id: tenantId },
    });
    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }

    // Unlink products from this category before deleting
    await this.productRepository.update(
      { tenant_id: tenantId, category_id: categoryId },
      { category_id: null as any },
    );

    await this.categoryRepository.remove(category);
  }

  async create(tenantId: string, dto: CreateProductDto): Promise<Product> {
    const payload = this.normalizeProductInput(dto);
    if (payload.is_weighed && !payload.barcode) {
      payload.barcode = await this.generateInternalBulkBarcode(tenantId);
    }

    if (payload.barcode) {
      await this.assertBarcodeUnique(tenantId, payload.barcode);
    }

    this.validateProductConfiguration(payload);

    const product = this.productRepository.create({
      ...payload,
      tenant_id: tenantId,
      active: true,
    });

    return this.productRepository.save(product);
  }

  async createBulkProduct(
    tenantId: string,
    dto: CreateProductDto,
  ): Promise<Product> {
    return this.create(tenantId, {
      ...dto,
      barcode: dto.barcode || undefined,
      is_weighed: true,
      tracks_stock: true,
      allow_cashier_reception: false,
      critical_stock: dto.critical_stock || 0,
    });
  }

  async findAll(
    tenantId: string,
    filters: FilterProductsDto,
  ): Promise<{ data: Product[]; total: number; page: number; limit: number } | Product[]> {
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
    if (filters.tracks_stock !== undefined) {
      where.tracks_stock = filters.tracks_stock;
    }
    if (filters.allow_cashier_reception !== undefined) {
      where.allow_cashier_reception = filters.allow_cashier_reception;
    }

    // If pagination params are provided, return paginated response
    if (filters.page || filters.limit) {
      const page = filters.page || 1;
      const limit = filters.limit || 50;
      const skip = (page - 1) * limit;

      const [data, total] = await this.productRepository.findAndCount({
        where,
        relations: ['category'],
        order: { name: 'ASC' },
        skip,
        take: limit,
      });

      return { data, total, page, limit };
    }

    // Legacy: return full list for backward compatibility
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
    changedBy?: string,
  ): Promise<Product> {
    const product = await this.findOne(tenantId, id);

    if (dto.barcode !== undefined && dto.barcode !== product.barcode) {
      if (dto.barcode !== null) {
        await this.assertBarcodeUnique(tenantId, dto.barcode, id);
      }
    }

    // Record price change in history
    if (dto.price !== undefined && dto.price !== product.price) {
      await this.priceHistoryRepository.save(
        this.priceHistoryRepository.create({
          product_id: product.id,
          old_price: product.price,
          new_price: dto.price,
          changed_by: changedBy || null,
        }),
      );
    }

    const nextState = this.normalizeProductInput({
      ...product,
      ...dto,
    });
    if (nextState.is_weighed && !nextState.barcode) {
      nextState.barcode = await this.generateInternalBulkBarcode(tenantId);
    }
    this.validateProductConfiguration(nextState);

    Object.assign(product, dto, {
      barcode: nextState.barcode,
      stock: nextState.stock,
      critical_stock: nextState.critical_stock,
      tracks_stock: nextState.tracks_stock,
      allow_cashier_reception: nextState.allow_cashier_reception,
    });
    return this.productRepository.save(product);
  }

  async createReception(
    tenantId: string,
    productId: string,
    userId: string,
    dto: CreateProductReceptionDto,
  ): Promise<ProductReception> {
    return this.dataSource.transaction(async (manager) => {
      const product = await manager
        .createQueryBuilder(Product, 'product')
        .setLock('pessimistic_write')
        .where('product.id = :productId', { productId })
        .andWhere('product.tenant_id = :tenantId', { tenantId })
        .andWhere('product.active = :active', { active: true })
        .getOne();

      if (!product) {
        throw new NotFoundException('Producto no encontrado');
      }

      if (!product.allow_cashier_reception) {
        throw new BadRequestException(
          'Este producto no permite recepcion por cajero',
        );
      }

      const reception = manager.create(ProductReception, {
        tenant_id: tenantId,
        product_id: product.id,
        user_id: userId,
        quantity: this.roundQuantity(dto.quantity),
        note: dto.note?.trim() || null,
        tracked_in_stock: product.tracks_stock,
      });

      if (product.tracks_stock) {
        product.stock = this.roundQuantity(
          Number(product.stock) + Number(dto.quantity),
        );
        await manager.save(Product, product);
      }

      return manager.save(ProductReception, reception);
    });
  }

  async softDelete(tenantId: string, id: string): Promise<void> {
    const product = await this.findOne(tenantId, id);
    product.active = false;
    await this.productRepository.save(product);
  }

  async bulkSoftDelete(
    tenantId: string,
    ids: string[],
  ): Promise<{ deleted: number; skipped: number; skipped_names: string[] }> {
    if (!ids || ids.length === 0) {
      return { deleted: 0, skipped: 0, skipped_names: [] };
    }

    let deleted = 0;
    const skippedNames: string[] = [];

    for (const id of ids) {
      try {
        const product = await this.productRepository.findOne({
          where: { id, tenant_id: tenantId, active: true },
        });
        if (!product) continue;

        product.active = false;
        await this.productRepository.save(product);
        deleted++;
      } catch {
        // Skip individual failures
      }
    }

    return {
      deleted,
      skipped: skippedNames.length,
      skipped_names: skippedNames,
    };
  }

  async getPriceHistory(tenantId: string, productId: string): Promise<PriceHistory[]> {
    // Verify product belongs to tenant
    await this.findOne(tenantId, productId);
    return this.priceHistoryRepository.find({
      where: { product_id: productId },
      order: { changed_at: 'DESC' },
      take: 50,
    });
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
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const count = await this.saleLineRepository
      .createQueryBuilder('sl')
      .innerJoin('sl.sale', 'sale')
      .where('sl.product_id = :productId', { productId })
      .andWhere('sale.created_at >= :since', { since: sevenDaysAgo })
      .getCount();

    return count > 0;
  }

  private async generateInternalBulkBarcode(tenantId: string): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
      const code = `MMG-${Date.now().toString(36).toUpperCase()}-${randomPart}`;
      const existing = await this.productRepository.findOne({
        where: { tenant_id: tenantId, barcode: code },
      });
      if (!existing) return code;
    }

    throw new BadRequestException(
      'No fue posible generar un codigo interno para el producto a granel',
    );
  }

  private roundQuantity(value: number): number {
    return Math.round(value * 1000) / 1000;
  }

  private normalizeProductInput<T extends Partial<Product>>(dto: T): T {
    const normalized = { ...dto } as T;

    if (normalized.tracks_stock === undefined) {
      normalized.tracks_stock = true as T['tracks_stock'];
    }

    if (normalized.allow_cashier_reception === undefined) {
      normalized.allow_cashier_reception = false as T['allow_cashier_reception'];
    }

    if (normalized.tracks_stock === false) {
      normalized.stock = 0 as T['stock'];
      normalized.critical_stock = 0 as T['critical_stock'];
    }

    return normalized;
  }

  private validateProductConfiguration(product: Partial<Product>): void {
    if (product.allow_cashier_reception && !product.is_weighed) {
      throw new BadRequestException(
        'La recepcion por cajero solo se puede activar en productos vendidos por peso o a granel',
      );
    }

    if (
      product.tracks_stock !== false &&
      !product.is_weighed &&
      Number(product.critical_stock ?? 0) <= 0
    ) {
      throw new BadRequestException(
        'El stock critico es requerido para productos con inventario por unidad',
      );
    }
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
