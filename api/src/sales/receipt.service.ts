import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../entities/tenant.entity';
import { TenantConfig } from '../entities/tenant-config.entity';
import { Sale } from '../entities/sale.entity';
import { BoletaStatus, PaymentMethod } from '../entities/enums';

export interface ReceiptItem {
  name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface ReceiptData {
  sale_id: string;
  store_name: string;
  store_rut: string;
  store_giro: string;
  store_address: string;
  date: string;
  items: ReceiptItem[];
  total: number;
  iva_included: number;
  payment_method: string;
  amount_received: number | null;
  change_amount: number | null;
  boleta_status: BoletaStatus;
  boleta_folio: string | null;
  boleta_timbre: string | null;
  boleta_pdf_url: string | null;
  boleta_provider: string | null;
  boleta_emitted_at: string | null;
  printer_enabled: boolean;
}

@Injectable()
export class ReceiptService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(TenantConfig)
    private readonly tenantConfigRepository: Repository<TenantConfig>,
  ) {}

  async generateReceipt(
    tenantId: string,
    sale: Sale,
  ): Promise<ReceiptData> {
    const [tenant, config] = await Promise.all([
      this.tenantRepository.findOne({ where: { id: tenantId } }),
      this.tenantConfigRepository.findOne({ where: { tenant_id: tenantId } }),
    ]);

    const storeName = config?.sii_razon_social || tenant?.name || 'Tienda';
    const storeRut = config?.sii_rut_emisor || tenant?.rut || '';
    const storeGiro = config?.sii_giro || '';
    const montoNeto = Math.round(sale.total / 1.19);
    const ivaIncluded = sale.total - montoNeto;

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
    const boletaTimbre =
      sale.boleta_status === BoletaStatus.EMITIDA && sale.boleta
        ? sale.boleta.timbre_electronico
        : null;
    const boletaPdfUrl =
      sale.boleta_status === BoletaStatus.EMITIDA && sale.boleta
        ? sale.boleta.pdf_url
        : null;
    const boletaProvider =
      sale.boleta_status === BoletaStatus.EMITIDA && sale.boleta
        ? sale.boleta.provider
        : null;
    const boletaEmittedAt =
      sale.boleta_status === BoletaStatus.EMITIDA && sale.boleta
        ? sale.boleta.emitted_at.toISOString()
        : null;

    return {
      sale_id: sale.id,
      store_name: storeName,
      store_rut: storeRut,
      store_giro: storeGiro,
      store_address: '',
      date: sale.created_at.toISOString(),
      items,
      total: sale.total,
      iva_included: ivaIncluded,
      payment_method: sale.payment_method,
      amount_received:
        sale.payment_method === PaymentMethod.EFECTIVO
          ? sale.amount_received
          : null,
      change_amount:
        sale.payment_method === PaymentMethod.EFECTIVO
          ? sale.change_amount
          : null,
      boleta_status: sale.boleta_status,
      boleta_folio: boletaFolio,
      boleta_timbre: boletaTimbre,
      boleta_pdf_url: boletaPdfUrl,
      boleta_provider: boletaProvider,
      boleta_emitted_at: boletaEmittedAt,
      printer_enabled: Boolean(config?.printer_enabled),
    };
  }
}
