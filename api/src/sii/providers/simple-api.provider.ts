import { Injectable, Logger } from '@nestjs/common';
import { SiiProvider } from '../../entities/enums';
import {
  ISiiProvider,
  SiiSaleData,
  SiiEmitResult,
  SiiCredentialError,
} from '../interfaces/sii-provider.interface';

@Injectable()
export class SimpleApiProvider implements ISiiProvider {
  private readonly logger = new Logger(SimpleApiProvider.name);
  readonly providerName = SiiProvider.SIMPLE_API;

  async emitBoleta(
    apiKey: string,
    saleData: SiiSaleData,
    sandbox: boolean,
  ): Promise<SiiEmitResult> {
    if (apiKey === 'test' || apiKey === 'sandbox') {
      this.logger.log('Modo prueba SimpleAPI: retornando boleta simulada');
      return {
        folio: String(Math.floor(Math.random() * 9000000) + 1000000),
        pdf_url: 'https://www.simpleapi.cl/test.pdf',
        timbre_electronico:
          '<TED><DD><RE>76123456-7</RE><TD>39</TD><F>123456</F><FD>2026-04-14</FD><TST>2026-04-14T12:00:00</TST></DD><FR>76123456-7</FR><RR>1-9</RR><RSR>ALMACEN DON PEDRO</RSR><MNT>10000</MNT><IT1>Producto Prueba</IT1></TED>',
      };
    }

    const baseUrl = sandbox
      ? 'https://api.simpleapi.cl'
      : 'https://api.simpleapi.cl';

    const fecha = saleData.fecha.toISOString().split('T')[0];

    const detalles = saleData.items.map((item, index) => ({
      NroLinDet: index + 1,
      NmbItem: item.nombre.substring(0, 80),
      QtyItem: Number(item.cantidad.toFixed(3)),
      PrcItem: Math.round(item.precio_unitario),
      MontoItem: Math.round(item.subtotal),
    }));

    const payload = {
      tipo_dte: 39,
      folio: 0,
      fecha_emision: fecha,
      emisor: {
        rut: saleData.rut_emisor,
      },
      receptor: {
        rut: '66666666-6',
        razon_social: 'Cliente Público',
        direccion: 'Sin Dirección',
        comuna: 'Santiago',
      },
      totales: {
        neto: saleData.monto_neto,
        iva: saleData.iva,
        total: saleData.monto_total,
      },
      detalles,
    };

    const endpoints = [
      `${baseUrl}/dte/emitir`,
      `${baseUrl}/v2/dte/emitir`,
      `${baseUrl}/dte/document`,
      `${baseUrl}/v2/dte/document`,
    ];

    let lastError: Error | null = null;

    for (const url of endpoints) {
      try {
        this.logger.log(`Probando endpoint SimpleAPI: ${url}`);
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          const data = await response.json();
          this.logger.log(`SimpleAPI respuesta exitosa: ${JSON.stringify(data)}`);
          
          return {
            folio: String(data.folio || data.Folio || ''),
            pdf_url: data.pdf_url || data.PDF || null,
            timbre_electronico: data.timbre || data.TIMBRE || data.timbre_electronico || '',
          };
        }

        const errorText = await response.text();
        this.logger.warn(`Endpoint ${url} respondió: ${response.status} - ${errorText}`);
        
        if (response.status === 401 || response.status === 403) {
          throw new SiiCredentialError('API Key de SimpleAPI inválida');
        }
        
        lastError = new Error(`HTTP ${response.status}: ${errorText}`);
      } catch (error) {
        if (error instanceof SiiCredentialError) throw error;
        this.logger.warn(`Error en endpoint ${url}: ${(error as Error).message}`);
        lastError = error as Error;
      }
    }

    this.logger.error(`Todos los endpoints de SimpleAPI fallaron`);
    throw lastError || new Error('No se pudo conectar a SimpleAPI');
  }
}