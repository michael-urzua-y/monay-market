import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale } from '../entities/sale.entity';
import { Product } from '../entities/product.entity';

export interface TodayMetrics {
  total_ventas: number;
  cantidad_ventas: number;
}

export interface MonthlyMetrics {
  mes_actual: number;
  mes_anterior: number;
  variacion_porcentual: number | null;
}

export interface DailyChartEntry {
  fecha: string;
  total: number;
}

export interface InventoryValue {
  valor_total: number;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async getToday(tenantId: string): Promise<TodayMetrics> {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const result = await this.saleRepository
      .createQueryBuilder('sale')
      .select('COALESCE(SUM(sale.total), 0)', 'total_ventas')
      .addSelect('COUNT(sale.id)', 'cantidad_ventas')
      .where('sale.tenant_id = :tenantId', { tenantId })
      .andWhere('sale.created_at >= :startOfDay', { startOfDay })
      .andWhere('sale.created_at <= :endOfDay', { endOfDay })
      .getRawOne();

    return {
      total_ventas: Number(result.total_ventas),
      cantidad_ventas: Number(result.cantidad_ventas),
    };
  }

  async getMonthly(tenantId: string): Promise<MonthlyMetrics> {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const previousMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    const currentResult = await this.saleRepository
      .createQueryBuilder('sale')
      .select('COALESCE(SUM(sale.total), 0)', 'total')
      .where('sale.tenant_id = :tenantId', { tenantId })
      .andWhere('sale.created_at >= :start', { start: currentMonthStart })
      .andWhere('sale.created_at <= :end', { end: currentMonthEnd })
      .getRawOne();

    const previousResult = await this.saleRepository
      .createQueryBuilder('sale')
      .select('COALESCE(SUM(sale.total), 0)', 'total')
      .where('sale.tenant_id = :tenantId', { tenantId })
      .andWhere('sale.created_at >= :start', { start: previousMonthStart })
      .andWhere('sale.created_at <= :end', { end: previousMonthEnd })
      .getRawOne();

    const mesActual = Number(currentResult.total);
    const mesAnterior = Number(previousResult.total);

    let variacionPorcentual: number | null = null;
    if (mesAnterior !== 0) {
      variacionPorcentual =
        ((mesActual - mesAnterior) / mesAnterior) * 100;
    }

    return {
      mes_actual: mesActual,
      mes_anterior: mesAnterior,
      variacion_porcentual: variacionPorcentual,
    };
  }

  async getDailyChart(tenantId: string): Promise<DailyChartEntry[]> {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const rawResults = await this.saleRepository
      .createQueryBuilder('sale')
      .select("DATE(sale.created_at)", 'fecha')
      .addSelect('COALESCE(SUM(sale.total), 0)', 'total')
      .where('sale.tenant_id = :tenantId', { tenantId })
      .andWhere('sale.created_at >= :start', { start: monthStart })
      .andWhere('sale.created_at <= :end', { end: monthEnd })
      .groupBy("DATE(sale.created_at)")
      .getRawMany();

    const salesByDate = new Map<string, number>();
    for (const row of rawResults) {
      const dateStr = row.fecha instanceof Date
        ? row.fecha.toISOString().split('T')[0]
        : String(row.fecha);
      salesByDate.set(dateStr, Number(row.total));
    }

    const chart: DailyChartEntry[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = date.toISOString().split('T')[0];
      chart.push({
        fecha: dateStr,
        total: salesByDate.get(dateStr) ?? 0,
      });
    }

    return chart;
  }

  async getCriticalStock(tenantId: string): Promise<Product[]> {
    return this.productRepository
      .createQueryBuilder('product')
      .where('product.tenant_id = :tenantId', { tenantId })
      .andWhere('product.active = :active', { active: true })
      .andWhere('product.stock > 0')
      .andWhere('product.stock < product.critical_stock')
      .orderBy('product.stock', 'ASC')
      .getMany();
  }

  async getInventoryValue(tenantId: string): Promise<InventoryValue> {
    const result = await this.productRepository
      .createQueryBuilder('product')
      .select('COALESCE(SUM(product.price * product.stock), 0)', 'valor_total')
      .where('product.tenant_id = :tenantId', { tenantId })
      .andWhere('product.active = :active', { active: true })
      .getRawOne();

    return {
      valor_total: Number(result.valor_total),
    };
  }
}
