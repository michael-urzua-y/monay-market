import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, DataSource, MoreThanOrEqual } from 'typeorm';
import { Merma } from '../entities/merma.entity';
import { Product } from '../entities/product.entity';
import { FilterMermasDto } from './dto/filter-mermas.dto';
import { CreateMermaDto } from './dto/create-merma.dto';

@Injectable()
export class MermasService {
  constructor(
    @InjectRepository(Merma)
    private mermasRepository: Repository<Merma>,
    private readonly dataSource: DataSource,
  ) {}

  async getStatsByPeriod(tenantId: string, month: string): Promise<{ monthly: number; weekly: number }> {
    const now = new Date();
    
    // Monthly (first day of selected month to first day of next month)
    const [year, monthNum] = month.split('-').map(Number);
    const monthStart = new Date(year, monthNum - 1, 1);
    const monthEnd = new Date(year, monthNum, 1);
    
    const monthlyMermas = await this.mermasRepository.find({
      where: {
        tenant_id: tenantId,
        created_at: Between(monthStart, monthEnd),
      },
    });
    const monthly = monthlyMermas.reduce((sum, m) => sum + m.value_loss, 0);
    
    // Weekly (last 7 days)
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    
    const weeklyMermas = await this.mermasRepository.find({
      where: {
        tenant_id: tenantId,
        created_at: MoreThanOrEqual(weekAgo),
      },
    });
    const weekly = weeklyMermas.reduce((sum, m) => sum + m.value_loss, 0);
    
    return { monthly, weekly };
  }

  async create(tenantId: string, dto: CreateMermaDto): Promise<Merma> {
    return this.dataSource.transaction(async (manager) => {
      const product = await manager
        .createQueryBuilder(Product, 'product')
        .setLock('pessimistic_write')
        .where('product.id = :productId', { productId: dto.product_id })
        .andWhere('product.tenant_id = :tenantId', { tenantId })
        .andWhere('product.active = :active', { active: true })
        .getOne();

      if (!product) {
        throw new NotFoundException('Producto no encontrado');
      }

      if (!product.tracks_stock) {
        throw new BadRequestException(
          'Este producto no utiliza control de stock. Registre la recepcion o venta sin inventario.',
        );
      }

      if (product.stock < dto.quantity) {
        throw new BadRequestException('Stock insuficiente');
      }

      const valueLoss = Math.round(product.price * dto.quantity);

      const merma = manager.create(Merma, {
        tenant_id: tenantId,
        product_id: dto.product_id,
        quantity: dto.quantity,
        cause: dto.cause,
        value_loss: valueLoss,
        note: dto.note || null,
      });

      product.stock = this.roundQuantity(Number(product.stock) - dto.quantity);
      await manager.save(Product, product);

      return manager.save(Merma, merma);
    });
  }

  /**
   * Historial de mermas, la más reciente primero. Con page/limit devuelve solo
   * esa página y el total (el panel la usa así); sin ellos, la lista completa.
   */
  async findAll(
    tenantId: string,
    filters: FilterMermasDto = {},
  ): Promise<Merma[] | { data: Merma[]; total: number; page: number; limit: number }> {
    const query = {
      where: { tenant_id: tenantId },
      relations: ['product'],
      order: { created_at: 'DESC' as const },
    };

    if (filters.page || filters.limit) {
      const page = filters.page || 1;
      const limit = filters.limit || 50;
      const [data, total] = await this.mermasRepository.findAndCount({
        ...query,
        skip: (page - 1) * limit,
        take: limit,
      });
      return { data, total, page, limit };
    }

    return this.mermasRepository.find(query);
  }

  async getStats(tenantId: string): Promise<{
    totalPerdido: number;
    porCausa: { causa: string; total: number }[];
  }> {
    const mermas = await this.mermasRepository.find({
      where: { tenant_id: tenantId },
    });

    const totalPerdido = mermas.reduce((sum, m) => sum + m.value_loss, 0);

    const porCausaMap = new Map<string, number>();
    for (const merma of mermas) {
      const current = porCausaMap.get(merma.cause) || 0;
      porCausaMap.set(merma.cause, current + merma.value_loss);
    }

    const porCausa = Array.from(porCausaMap.entries()).map(([causa, total]) => ({
      causa,
      total,
    }));

    return { totalPerdido, porCausa };
  }

  private roundQuantity(value: number): number {
    return Math.round(value * 1000) / 1000;
  }
}
