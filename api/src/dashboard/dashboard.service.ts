import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sale } from '../entities/sale.entity';
import { Product } from '../entities/product.entity';

const CHILE_TIME_ZONE = 'America/Santiago';

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

  private getChileDateParts(date = new Date()): { year: string; month: string; day: string } {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: CHILE_TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date).reduce<Record<string, string>>((acc, part) => {
      acc[part.type] = part.value;
      return acc;
    }, {});

    return {
      year: parts.year,
      month: parts.month,
      day: parts.day,
    };
  }

  private getChileDateString(date = new Date()): string {
    const parts = this.getChileDateParts(date);
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  private getChileMonthString(date = new Date()): string {
    const parts = this.getChileDateParts(date);
    return `${parts.year}-${parts.month}`;
  }

  private shiftMonth(monthStr: string, offset: number): string {
    const [yearStr, monthStrValue] = monthStr.split('-');
    const base = new Date(Date.UTC(parseInt(yearStr, 10), parseInt(monthStrValue, 10) - 1 + offset, 1));
    const year = base.getUTCFullYear();
    const month = String(base.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  async getToday(tenantId: string): Promise<TodayMetrics> {
    const chileToday = this.getChileDateString();
    const [result] = await this.saleRepository.query(`
      SELECT
        COALESCE(SUM(s.total), 0) AS total_ventas,
        COUNT(s.id) AS cantidad_ventas
      FROM market.sales s
      WHERE s.tenant_id = $1
        AND DATE(s.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${CHILE_TIME_ZONE}') = $2
    `, [tenantId, chileToday]);

    return {
      total_ventas: Number(result.total_ventas),
      cantidad_ventas: Number(result.cantidad_ventas),
    };
  }

  async getMonthly(tenantId: string): Promise<MonthlyMetrics> {
    const currentMonth = this.getChileMonthString();
    const previousMonth = this.shiftMonth(currentMonth, -1);

    const [currentResult] = await this.saleRepository.query(`
      SELECT COALESCE(SUM(s.total), 0) AS total
      FROM market.sales s
      WHERE s.tenant_id = $1
        AND TO_CHAR(s.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${CHILE_TIME_ZONE}', 'YYYY-MM') = $2
    `, [tenantId, currentMonth]);

    const [previousResult] = await this.saleRepository.query(`
      SELECT COALESCE(SUM(s.total), 0) AS total
      FROM market.sales s
      WHERE s.tenant_id = $1
        AND TO_CHAR(s.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${CHILE_TIME_ZONE}', 'YYYY-MM') = $2
    `, [tenantId, previousMonth]);

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

  async getDailyChart(tenantId: string, targetMonth?: string): Promise<DailyChartEntry[]> {
    let year: number;
    let month: number;
    let monthFilter: string;

    if (targetMonth) {
      const [y, m] = targetMonth.split('-');
      year = parseInt(y, 10);
      month = parseInt(m, 10) - 1;
      monthFilter = targetMonth;
    } else {
      const currentMonth = this.getChileMonthString();
      const [y, m] = currentMonth.split('-');
      year = parseInt(y, 10);
      month = parseInt(m, 10) - 1;
      monthFilter = currentMonth;
    }

    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const rawResults = await this.saleRepository.query(`
      SELECT
        TO_CHAR(s.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${CHILE_TIME_ZONE}', 'YYYY-MM-DD') AS fecha,
        COALESCE(SUM(s.total), 0) AS total
      FROM market.sales s
      WHERE s.tenant_id = $1
        AND TO_CHAR(s.created_at AT TIME ZONE 'UTC' AT TIME ZONE '${CHILE_TIME_ZONE}', 'YYYY-MM') = $2
      GROUP BY 1
      ORDER BY 1 ASC
    `, [tenantId, monthFilter]);

    const salesByDate = new Map<string, number>();
    for (const row of rawResults) {
      salesByDate.set(String(row.fecha), Number(row.total));
    }

    const chart: DailyChartEntry[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
      .andWhere('product.tracks_stock = true')
      .andWhere('product.stock > 0')
      .andWhere('product.critical_stock > 0')
      .andWhere('product.stock <= product.critical_stock')
      .orderBy('product.stock', 'ASC')
      .getMany();
  }

  async getInventoryValue(tenantId: string): Promise<InventoryValue> {
    const result = await this.productRepository
      .createQueryBuilder('product')
      .select('COALESCE(SUM(product.price * product.stock), 0)', 'valor_total')
      .where('product.tenant_id = :tenantId', { tenantId })
      .andWhere('product.active = :active', { active: true })
      .andWhere('product.tracks_stock = true')
      .getRawOne();

    return {
      valor_total: Number(result.valor_total),
    };
  }

  async getTopProducts(tenantId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Los 5 Más Vendidos
    const top = await this.saleRepository.query(`
      SELECT sl.product_name AS name, SUM(sl.quantity) AS total_quantity
      FROM market.sale_lines sl
      JOIN market.sales s ON s.id = sl.sale_id
      WHERE s.tenant_id = $1 AND s.created_at >= $2
      GROUP BY sl.product_name
      ORDER BY total_quantity DESC
      LIMIT 5
    `, [tenantId, thirtyDaysAgo]);

    // Los 5 Menos Vendidos
    const bottom = await this.saleRepository.query(`
      SELECT sl.product_name AS name, SUM(sl.quantity) AS total_quantity
      FROM market.sale_lines sl
      JOIN market.sales s ON s.id = sl.sale_id
      WHERE s.tenant_id = $1 AND s.created_at >= $2
      GROUP BY sl.product_name
      ORDER BY total_quantity ASC
      LIMIT 5
    `, [tenantId, thirtyDaysAgo]);

    return { top, bottom };
  }

  async getPeakHours(tenantId: string, period?: string) {
    const dateFilter =
      period === 'week'
        ? `AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE '${CHILE_TIME_ZONE}') >= date_trunc('week', timezone('${CHILE_TIME_ZONE}', now()))`
        : `AND (created_at AT TIME ZONE 'UTC' AT TIME ZONE '${CHILE_TIME_ZONE}') >= (timezone('${CHILE_TIME_ZONE}', now()) - interval '30 days')`;

    const hours = await this.saleRepository.query(`
      SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC' AT TIME ZONE '${CHILE_TIME_ZONE}') AS hour, COUNT(id) AS count
      FROM market.sales
      WHERE tenant_id = $1
      ${dateFilter}
      GROUP BY EXTRACT(HOUR FROM created_at AT TIME ZONE 'UTC' AT TIME ZONE '${CHILE_TIME_ZONE}')
      ORDER BY hour ASC
    `, [tenantId]);

    return hours.map((h: any) => ({
      hour: Math.floor(h.hour),
      count: Number(h.count)
    }));
  }
}
