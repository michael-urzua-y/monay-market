import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

  constructor(private readonly configService: ConfigService) {}

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

    const rutSinPuntos = saleData.rut_emisor.replace(/\./g, '');
    const rutPersonal = this.getRequiredCredential(
      'SII_BASEAPI_RUT',
      'RUT BaseAPI',
    ).replace(/\./g, '');
    const password = this.getRequiredCredential(
      'SII_BASEAPI_PASSWORD',
      'password BaseAPI',
    );
    const certPassword = this.getRequiredCredential(
      'SII_BASEAPI_CERT_PASSWORD',
      'clave de certificado BaseAPI',
    );

    const payload = {
      rut: rutPersonal,
      password,
      clave_certificado: certPassword,
      rut_empresa: rutSinPuntos,
      receptor: {
        rut: '66666666-6',
      },
      items: saleData.items.map((item) => ({
        nombre: item.nombre.substring(0, 80),
        cantidad: Number(item.cantidad.toFixed(3)),
        precio: Math.round(item.precio_unitario),
      })),
      forma_pago: 'CONTADO',
      tipo_dte: 33,
      descargar_pdf: false,
    };

    try {
      const response = await fetch(`${baseUrl}/sii/dte/emitir/factura`, {
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

  private getRequiredCredential(envKey: string, label: string): string {
    const value = this.configService.get<string>(envKey)?.trim();
    if (!value) {
      throw new SiiCredentialError(`${label} no configurado en variables de entorno`);
    }
    return value;
  }
}
