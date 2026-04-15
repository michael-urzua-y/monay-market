import { Injectable, Logger } from '@nestjs/common';
import { SiiProvider } from '../../entities/enums';
import {
  ISiiProvider,
  SiiSaleData,
  SiiEmitResult,
  SiiCredentialError,
} from '../interfaces/sii-provider.interface';

@Injectable()
export class BaseApiProvider implements ISiiProvider {
  private readonly logger = new Logger(BaseApiProvider.name);
  readonly providerName = SiiProvider.BASE_API;

  async emitBoleta(
    apiKey: string,
    saleData: SiiSaleData,
    sandbox: boolean,
  ): Promise<SiiEmitResult> {
    if (apiKey === 'test' || apiKey === 'sandbox' || sandbox) {
      this.logger.log('Modo prueba BaseAPI: retornando boleta simulada');
      return {
        folio: String(Math.floor(Math.random() * 9000000) + 1000000),
        pdf_url: 'https://www.baseapi.cl/test.pdf',
        timbre_electronico:
          '<TED><DD><RE>76123456-7</RE><TD>39</TD><F>123456</F><FD>2026-04-14</FD><TST>2026-04-14T12:00:00</TST></DD><FR>76123456-7</FR><RR>1-9</RR><RSR>ALMACEN DON PEDRO</RSR><MNT>10000</MNT><IT1>Producto Prueba</IT1></TED>',
      };
    }

    const baseUrl = 'https://api.baseapi.cl/api/v1';

    const fecha = saleData.fecha.toISOString().split('T')[0];

    const payload = {
      tipo: 39,
      folio: 0,
      fecha_emision: fecha,
      emisor: {
        rut: saleData.rut_emisor,
        razon_social: 'Almacén Don Pedro',
      },
      receptor: {
        rut: '66666666-6',
        razon_social: 'Cliente Final',
      },
      items: saleData.items.map((item) => ({
        nombre: item.nombre.substring(0, 80),
        cantidad: Number(item.cantidad.toFixed(3)),
        precio: Math.round(item.precio_unitario),
        total: Math.round(item.subtotal),
      })),
      neto: saleData.monto_neto,
      iva: saleData.iva,
      total: saleData.monto_total,
    };

    try {
      const response = await fetch(`${baseUrl}/sii/dte/emitir`, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      this.logger.log(`BaseAPI response status: ${response.status}, body: ${responseText}`);

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new SiiCredentialError('API Key de BaseAPI inválida');
        }
        
        try {
          const errorData = JSON.parse(responseText);
          throw new Error(errorData.message || errorData.error || responseText);
        } catch {
          throw new Error(`HTTP ${response.status}: ${responseText}`);
        }
      }

      const data = JSON.parse(responseText);

      return {
        folio: String(data.folio || data.data?.folio || ''),
        pdf_url: data.pdf_url || data.pdf || data.data?.pdf || null,
        timbre_electronico: data.timbre || data.TIMBRE || data.timbre_electronico || data.data?.timbre || '',
      };
    } catch (error: unknown) {
      if (error instanceof SiiCredentialError) throw error;
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error emitiendo boleta en BaseAPI: ${errorMessage}`);
      throw new Error(`Error BaseAPI: ${errorMessage}`);
    }
  }
}