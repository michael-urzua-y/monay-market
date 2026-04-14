import { Injectable, Logger } from '@nestjs/common';
import { SiiProvider } from '../../entities/enums';
import {
  ISiiProvider,
  SiiSaleData,
  SiiEmitResult,
  SiiCredentialError,
} from '../interfaces/sii-provider.interface';

@Injectable()
export class HaulmerProvider implements ISiiProvider {
  private readonly logger = new Logger(HaulmerProvider.name);
  readonly providerName = SiiProvider.HAULMER;

  async emitBoleta(
    apiKey: string,
    saleData: SiiSaleData,
    sandbox: boolean,
  ): Promise<SiiEmitResult> {
    const url = sandbox
      ? 'https://dev-api.haulmer.com/v2/dte/document'
      : 'https://api.haulmer.com/v2/dte/document';

    // Fecha en formato YYYY-MM-DD
    const fecha = saleData.fecha.toISOString().split('T')[0];

    const detalles = saleData.items.map((item, index) => ({
      NroLinDet: index + 1,
      NmbItem: item.nombre.substring(0, 80),
      QtyItem: Number(item.cantidad.toFixed(3)),
      PrcItem: Math.round(item.precio_unitario),
      MontoItem: Math.round(item.subtotal),
    }));

    const payload = {
      response: ['PDF', 'FOLIO', 'TIMBRE'],
      dte: {
        Encabezado: {
          IdDoc: {
            TipoDTE: 39, // 39 es el código oficial del SII para Boletas Electrónicas
            Folio: 0,
            FchEmis: fecha,
            IndServicio: 3,
          },
          Emisor: {
            RUTEmisor: saleData.rut_emisor,
          },
          Receptor: {
            RUTRecep: '66666666-6',
            RznSocRecep: 'Cliente Público',
            DirRecep: 'Sin Direccion',
            CmnaRecep: 'Santiago',
          },
          Totales: {
            MntoNeto: saleData.monto_neto,
            IVA: saleData.iva,
            MntoTotal: saleData.monto_total,
          },
        },
        Detalle: detalles,
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401 || response.status === 403) {
          throw new SiiCredentialError('API Key de Haulmer inválida');
        }
        throw new Error(errorData.message || response.statusText);
      }

      const data = await response.json();
      
      return {
        folio: data.FOLIO,
        pdf_url: data.PDF,
        timbre_electronico: data.TIMBRE || '<TED></TED>',
      };
    } catch (error: any) {
      if (error instanceof SiiCredentialError) throw error;
      this.logger.error(`Error emitiendo boleta en Haulmer: ${error.message}`);
      throw new Error(`Error Haulmer: ${error.message}`);
    }
  }
}
