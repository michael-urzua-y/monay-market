import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantConfig } from '../entities/tenant-config.entity';
import { Sale } from '../entities/sale.entity';
import { Boleta } from '../entities/boleta.entity';
import { BoletaStatus, SiiProvider } from '../entities/enums';
import {
  ISiiProvider,
  SiiSaleData,
  SiiSaleItem,
  SiiEmitResult,
  SiiCredentialError,
} from './interfaces/sii-provider.interface';
import { HaulmerProvider } from './providers/haulmer.provider';
import { OpenFacturaProvider } from './providers/openfactura.provider';
import { FacturacionClProvider } from './providers/facturacion-cl.provider';
import { SimpleApiProvider } from './providers/simple-api.provider';
import { BaseApiProvider } from './providers/base-api.provider';

/** IVA rate in Chile: 19% */
const IVA_RATE = 0.19;

/** Default timeout per attempt in ms */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** Maximum number of retry attempts */
export const MAX_RETRIES = 3;

/** Delay between retries in ms */
export const RETRY_DELAY_MS = 5_000;

export interface EmitBoletaResult {
  boleta_status: BoletaStatus;
  boleta?: Boleta;
  error?: string;
}

@Injectable()
export class SiiService {
  private readonly logger = new Logger(SiiService.name);
  private readonly providers: Map<SiiProvider, ISiiProvider>;

  constructor(
    @InjectRepository(TenantConfig)
    private readonly configRepository: Repository<TenantConfig>,
    @InjectRepository(Sale)
    private readonly saleRepository: Repository<Sale>,
    @InjectRepository(Boleta)
    private readonly boletaRepository: Repository<Boleta>,
    haulmerProvider: HaulmerProvider,
    openFacturaProvider: OpenFacturaProvider,
    facturacionClProvider: FacturacionClProvider,
    simpleApiProvider: SimpleApiProvider,
    baseApiProvider: BaseApiProvider,
  ) {
    this.providers = new Map<SiiProvider, ISiiProvider>([
      [SiiProvider.HAULMER, haulmerProvider],
      [SiiProvider.OPENFACTURA, openFacturaProvider],
      [SiiProvider.FACTURACION_CL, facturacionClProvider],
      [SiiProvider.SIMPLE_API, simpleApiProvider],
      [SiiProvider.BASE_API, baseApiProvider],
    ]);
  }

  /**
   * Main entry point: emit boleta for a sale.
   * If SII is disabled for the tenant, returns immediately with "no_aplica".
   */
  async emitBoleta(tenantId: string, saleId: string): Promise<EmitBoletaResult> {
    const config = await this.configRepository.findOne({
      where: { tenant_id: tenantId },
    });

    if (!config?.sii_enabled) {
      return { boleta_status: BoletaStatus.NO_APLICA };
    }

    const sale = await this.saleRepository.findOne({
      where: { id: saleId, tenant_id: tenantId },
      relations: ['lines'],
    });

    if (!sale) {
      return { boleta_status: BoletaStatus.ERROR, error: 'Venta no encontrada' };
    }

    const siiProvider = config.sii_provider;
    const provider = siiProvider
      ? this.providers.get(siiProvider)
      : undefined;
    if (!provider || !siiProvider) {
      await this.updateSaleStatus(saleId, BoletaStatus.ERROR);
      return {
        boleta_status: BoletaStatus.ERROR,
        error: `Proveedor SII no configurado: ${config.sii_provider}`,
      };
    }

    const saleData = this.buildSaleData(sale, config);

    try {
      const result = await this.emitWithRetries(
        provider,
        config.sii_api_key || '',
        saleData,
        config.sii_sandbox_mode,
      );

      const boleta = await this.storeBoleta(
        sale,
        tenantId,
        siiProvider,
        result,
      );

      await this.updateSaleStatus(saleId, BoletaStatus.EMITIDA);

      return { boleta_status: BoletaStatus.EMITIDA, boleta };
    } catch (error) {
      if (error instanceof SiiCredentialError) {
        await this.updateSaleStatus(saleId, BoletaStatus.ERROR);
        this.logger.error(
          `Error de credenciales SII para tenant ${tenantId}: ${error.message}`,
        );
        return {
          boleta_status: BoletaStatus.ERROR,
          error: 'Error de credenciales SII. Revise la configuración.',
        };
      }

      await this.updateSaleStatus(saleId, BoletaStatus.PENDIENTE);
      this.logger.warn(
        `Boleta pendiente para venta ${saleId}: ${(error as Error).message}`,
      );
      return {
        boleta_status: BoletaStatus.PENDIENTE,
        error: 'No se pudo emitir la boleta. Se reintentará más tarde.',
      };
    }
  }

  /**
   * Retry boleta emission for a sale that is in "pendiente" status.
   */
  async retryBoleta(tenantId: string, saleId: string): Promise<EmitBoletaResult> {
    const sale = await this.saleRepository.findOne({
      where: { id: saleId, tenant_id: tenantId },
    });

    if (!sale) {
      return { boleta_status: BoletaStatus.ERROR, error: 'Venta no encontrada' };
    }

    if (sale.boleta_status !== BoletaStatus.PENDIENTE && sale.boleta_status !== BoletaStatus.ERROR) {
      return {
        boleta_status: sale.boleta_status,
        error: `Solo se pueden reintentar ventas con estado "pendiente" o "error". Estado actual: ${sale.boleta_status}`,
      };
    }

    return this.emitBoleta(tenantId, saleId);
  }

  /** Build SII sale data from a Sale entity */
  buildSaleData(sale: Sale, config: TenantConfig): SiiSaleData {
    const montoTotal = sale.total;
    const montoNeto = Math.round(montoTotal / (1 + IVA_RATE));
    const iva = montoTotal - montoNeto;

    const items: SiiSaleItem[] = (sale.lines || []).map((line) => ({
      nombre: line.product_name,
      cantidad: line.quantity,
      precio_unitario: line.unit_price,
      subtotal: line.subtotal,
    }));

    return {
      sale_id: sale.id,
      rut_emisor: config.sii_rut_emisor || '',
      items,
      monto_neto: montoNeto,
      iva,
      monto_total: montoTotal,
      fecha: sale.created_at,
    };
  }

  /** Attempt emission with retries */
  async emitWithRetries(
    provider: ISiiProvider,
    apiKey: string,
    saleData: SiiSaleData,
    sandbox: boolean,
    maxRetries = MAX_RETRIES,
    retryDelayMs = RETRY_DELAY_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<SiiEmitResult> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.callWithTimeout(
          provider.emitBoleta(apiKey, saleData, sandbox),
          timeoutMs,
        );
        return result;
      } catch (error) {
        if (error instanceof SiiCredentialError) {
          throw error; // Don't retry credential errors
        }
        lastError = error as Error;
        this.logger.warn(
          `SII attempt ${attempt}/${maxRetries} failed: ${lastError.message}`,
        );
        if (attempt < maxRetries) {
          await this.delay(retryDelayMs);
        }
      }
    }

    throw lastError || new Error('Emisión de boleta falló después de reintentos');
  }

  private async callWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Timeout después de ${timeoutMs}ms`)),
        timeoutMs,
      );
      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }

  private async storeBoleta(
    sale: Sale,
    tenantId: string,
    provider: SiiProvider,
    result: SiiEmitResult,
  ): Promise<Boleta> {
    const boleta = this.boletaRepository.create({
      sale_id: sale.id,
      tenant_id: tenantId,
      folio: result.folio,
      timbre_electronico: result.timbre_electronico,
      pdf_url: result.pdf_url,
      provider,
      emitted_at: new Date(),
    });
    return this.boletaRepository.save(boleta);
  }

  private async updateSaleStatus(
    saleId: string,
    status: BoletaStatus,
  ): Promise<void> {
    await this.saleRepository.update(saleId, { boleta_status: status });
  }

  /** Utility: delay for ms (injectable for testing) */
  delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
