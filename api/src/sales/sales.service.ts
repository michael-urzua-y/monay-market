import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { Sale } from '../entities/sale.entity';
import { SaleLine } from '../entities/sale-line.entity';
import { Product } from '../entities/product.entity';
import { PaymentMethod, BoletaStatus } from '../entities/enums';
import { CreateSaleDto, SaleLineDto } from './dto/create-sale.dto';
import { FilterSalesDto } from './dto/filter-sales.dto';

export interface CriticalStockAlert {
  product_id: string;
  product_name: string;
  current_stock: number;
  critical_stock: number;
}

export interface SaleResult {
  sale: Sale;
  critical_stock_alerts: CriticalStockAlert[];
  receipt?: import('./receipt.service').ReceiptData;
}

export interface CloseRegisterResult {
  total_ventas: number;
  cantidad_ventas: number;
  total_efectivo: number;
  cantidad_efectivo: number;
  total_tarjeta: number;
  cantidad_tarjeta: number;
  ventas: Sale[];
}

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    private readonly dataSource: DataSource,
  ) {}

  async create(
    tenantId: string,
    userId: string,
    dto: CreateSaleDto,
  ): Promise<SaleResult> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const result = await this.executeTransaction(
        queryRunner.manager,
        tenantId,
        userId,
        dto,
      );
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async executeTransaction(
    manager: EntityManager,
    tenantId: string,
    userId: string,
    dto: CreateSaleDto,
  ): Promise<SaleResult> {
    const productIds = dto.lines.map((l) => l.product_id);

    // Lock products with SELECT ... FOR UPDATE
    const products = await manager
      .createQueryBuilder(Product, 'p')
      .setLock('pessimistic_write')
      .where('p.tenant_id = :tenantId', { tenantId })
      .andWhere('p.id IN (:...productIds)', { productIds })
      .getMany();

    const productMap = new Map(products.map((p) => [p.id, p]));

    this.validateProductsExist(dto.lines, productMap);
    this.validateStock(dto.lines, productMap);

    const { total, saleLines } = this.buildSaleLines(dto.lines, productMap);

    this.validatePayment(dto, total);

    const { amountReceived, changeAmount } =
      this.resolvePaymentFields(dto, total);

    const savedSale = await this.insertSale(manager, {
      tenantId,
      userId,
      total,
      paymentMethod: dto.payment_method,
      amountReceived,
      changeAmount,
    });

    const savedLines = await this.insertSaleLines(
      manager,
      savedSale.id,
      saleLines,
    );

    const criticalStockAlerts = await this.updateStockAndCollectAlerts(
      manager,
      dto.lines,
      productMap,
    );

    savedSale.lines = savedLines;

    return { sale: savedSale, critical_stock_alerts: criticalStockAlerts };
  }

  private validateProductsExist(
    lines: SaleLineDto[],
    productMap: Map<string, Product>,
  ): void {
    for (const line of lines) {
      if (!productMap.has(line.product_id)) {
        throw new NotFoundException(
          `Producto ${line.product_id} no encontrado`,
        );
      }
    }
  }

  private validateStock(
    lines: SaleLineDto[],
    productMap: Map<string, Product>,
  ): void {
    const errors: Array<{
      product_id: string;
      requested: number;
      available: number;
    }> = [];

    for (const line of lines) {
      const product = productMap.get(line.product_id);
      if (product && line.quantity > product.stock) {
        errors.push({
          product_id: product.id,
          requested: line.quantity,
          available: product.stock,
        });
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        error: 'INSUFFICIENT_STOCK',
        details: errors,
      });
    }
  }

  private buildSaleLines(
    lines: SaleLineDto[],
    productMap: Map<string, Product>,
  ): { total: number; saleLines: Partial<SaleLine>[] } {
    let total = 0;
    const saleLines: Partial<SaleLine>[] = [];

    for (const line of lines) {
      const product = productMap.get(line.product_id);
      if (!product) continue;
      const subtotal = line.quantity * product.price;
      total += subtotal;

      saleLines.push({
        product_id: product.id,
        product_name: product.name,
        unit_price: product.price,
        quantity: line.quantity,
        subtotal,
      });
    }

    return { total, saleLines };
  }

  private validatePayment(dto: CreateSaleDto, total: number): void {
    if (dto.payment_method !== PaymentMethod.EFECTIVO) return;

    if (dto.amount_received == null || dto.amount_received < total) {
      const received = dto.amount_received ?? 0;
      throw new BadRequestException({
        error: 'INSUFFICIENT_PAYMENT',
        total,
        received,
        missing: total - received,
      });
    }
  }

  private resolvePaymentFields(
    dto: CreateSaleDto,
    total: number,
  ): { amountReceived: number | null; changeAmount: number | null } {
    if (dto.payment_method === PaymentMethod.EFECTIVO) {
      return {
        amountReceived: dto.amount_received ?? 0,
        changeAmount: (dto.amount_received ?? 0) - total,
      };
    }
    return { amountReceived: null, changeAmount: null };
  }

  private async insertSale(
    manager: EntityManager,
    data: {
      tenantId: string;
      userId: string;
      total: number;
      paymentMethod: PaymentMethod;
      amountReceived: number | null;
      changeAmount: number | null;
    },
  ): Promise<Sale> {
    const sale = manager.create(Sale, {
      tenant_id: data.tenantId,
      user_id: data.userId,
      total: data.total,
      payment_method: data.paymentMethod,
      amount_received: data.amountReceived,
      change_amount: data.changeAmount,
      boleta_status: BoletaStatus.NO_APLICA,
    });
    return manager.save(Sale, sale);
  }

  private async insertSaleLines(
    manager: EntityManager,
    saleId: string,
    saleLines: Partial<SaleLine>[],
  ): Promise<SaleLine[]> {
    const savedLines: SaleLine[] = [];
    for (const lineData of saleLines) {
      const saleLine = manager.create(SaleLine, {
        ...lineData,
        sale_id: saleId,
      });
      savedLines.push(await manager.save(SaleLine, saleLine));
    }
    return savedLines;
  }

  private async updateStockAndCollectAlerts(
    manager: EntityManager,
    lines: SaleLineDto[],
    productMap: Map<string, Product>,
  ): Promise<CriticalStockAlert[]> {
    const alerts: CriticalStockAlert[] = [];

    for (const line of lines) {
      const product = productMap.get(line.product_id);
      if (!product) continue;
      const newStock = product.stock - line.quantity;

      await manager.update(Product, product.id, { stock: newStock });

      if (newStock > 0 && newStock < product.critical_stock) {
        alerts.push({
          product_id: product.id,
          product_name: product.name,
          current_stock: newStock,
          critical_stock: product.critical_stock,
        });
      }
    }

    return alerts;
  }

  async findAll(tenantId: string, filters: FilterSalesDto): Promise<Sale[]> {
    const qb = this.saleRepository
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.lines', 'lines')
      .leftJoinAndSelect('sale.boleta', 'boleta')
      .where('sale.tenant_id = :tenantId', { tenantId })
      .orderBy('sale.created_at', 'DESC');

    if (filters.date_from) {
      qb.andWhere('sale.created_at >= :dateFrom', {
        dateFrom: filters.date_from,
      });
    }

    if (filters.date_to) {
      qb.andWhere('sale.created_at <= :dateTo', {
        dateTo: filters.date_to,
      });
    }

    if (filters.boleta_status) {
      qb.andWhere('sale.boleta_status = :boletaStatus', {
        boletaStatus: filters.boleta_status,
      });
    }

    return qb.getMany();
  }

  async findOne(tenantId: string, saleId: string): Promise<Sale> {
    const sale = await this.saleRepository.findOne({
      where: { id: saleId, tenant_id: tenantId },
      relations: ['lines', 'boleta'],
    });

    if (!sale) {
      throw new NotFoundException(`Venta ${saleId} no encontrada`);
    }

    return sale;
  }

  async closeRegister(tenantId: string): Promise<CloseRegisterResult> {
    const now = new Date();
    const startOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const endOfDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59,
      999,
    );

    const ventas = await this.saleRepository
      .createQueryBuilder('sale')
      .leftJoinAndSelect('sale.lines', 'lines')
      .where('sale.tenant_id = :tenantId', { tenantId })
      .andWhere('sale.created_at >= :startOfDay', { startOfDay })
      .andWhere('sale.created_at <= :endOfDay', { endOfDay })
      .orderBy('sale.created_at', 'ASC')
      .getMany();

    let total_ventas = 0;
    let total_efectivo = 0;
    let cantidad_efectivo = 0;
    let total_tarjeta = 0;
    let cantidad_tarjeta = 0;

    for (const venta of ventas) {
      total_ventas += venta.total;
      if (venta.payment_method === PaymentMethod.EFECTIVO) {
        total_efectivo += venta.total;
        cantidad_efectivo++;
      } else {
        total_tarjeta += venta.total;
        cantidad_tarjeta++;
      }
    }

    return {
      total_ventas,
      cantidad_ventas: ventas.length,
      total_efectivo,
      cantidad_efectivo,
      total_tarjeta,
      cantidad_tarjeta,
      ventas,
    };
  }
}
