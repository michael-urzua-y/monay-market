import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../entities/tenant.entity';
import { Sale } from '../entities/sale.entity';
import { BoletaStatus, PaymentMethod } from '../entities/enums';

export interface ReceiptItem {
  name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface ReceiptData {
  store_name: string;
  date: string;
  items: ReceiptItem[];
  total: number;
  payment_method: string;
  amount_received: number | null;
  change_amount: number | null;
  boleta_folio: string | null;
}

@Injectable()
export class ReceiptService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
  ) {}

  async generateReceipt(
    tenantId: string,
    sale: Sale,
  ): Promise<ReceiptData> {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });

    const storeName = tenant?.name ?? 'Tienda';

    const items: ReceiptItem[] = (sale.lines ?? []).map((line) => ({
      name: line.product_name,
      quantity: line.quantity,
      unit_price: line.unit_price,
      subtotal: line.subtotal,
    }));

    const boletaFolio =
      sale.boleta_status === BoletaStatus.EMITIDA && sale.boleta
        ? sale.boleta.folio
        : null;

    return {
      store_name: storeName,
      date: sale.created_at.toISOString(),
      items,
      total: sale.total,
      payment_method: sale.payment_method,
      amount_received:
        sale.payment_method === PaymentMethod.EFECTIVO
          ? sale.amount_received
          : null,
      change_amount:
        sale.payment_method === PaymentMethod.EFECTIVO
          ? sale.change_amount
          : null,
      boleta_folio: boletaFolio,
    };
  }
}
