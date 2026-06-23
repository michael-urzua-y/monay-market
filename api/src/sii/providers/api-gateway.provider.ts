import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod, SiiProvider } from '../../entities/enums';
import {
  ISiiProvider,
  SiiCredentialError,
  SiiEmitResult,
  SiiPermanentError,
  SiiSaleData,
} from '../interfaces/sii-provider.interface';

@Injectable()
export class ApiGatewayProvider implements ISiiProvider {
  private readonly logger = new Logger(ApiGatewayProvider.name);
  readonly providerName = SiiProvider.API_GATEWAY;

  constructor(private readonly configService: ConfigService) {}

  async emitBoleta(
    apiKey: string,
    saleData: SiiSaleData,
    sandbox: boolean,
  ): Promise<SiiEmitResult> {
    if (sandbox) {
      this.logger.log('Modo prueba API Gateway: retornando boleta simulada');
      return {
        folio: String(Math.floor(Math.random() * 9000000) + 1000000),
        pdf_url: 'https://www.apigateway.cl/test.pdf',
        timbre_electronico:
          '<EBOLETA><PROVEEDOR>api_gateway</PROVEEDOR><DTE>39</DTE><ESTADO>simulada</ESTADO></EBOLETA>',
      };
    }

    const token = apiKey?.trim();
    if (!token) {
      throw new SiiCredentialError('Token de API Gateway no configurado');
    }

    const rutEmisor = this.normalizeRut(saleData.rut_emisor);
    if (!rutEmisor) {
      throw new SiiCredentialError('RUT emisor no configurado');
    }

    const rutAutenticador = this.normalizeRut(saleData.rut_autenticador || saleData.rut_emisor);
    if (!rutAutenticador) {
      throw new SiiCredentialError('RUT autenticador SII no configurado');
    }

    const claveTributaria = saleData.clave_tributaria?.trim();
    if (!claveTributaria) {
      throw new SiiCredentialError('Clave tributaria SII no configurada para API Gateway');
    }

    const codigoSucursal = saleData.codigo_sucursal ?? 0;

    const baseUrl =
      this.configService.get<string>('SII_APIGATEWAY_BASE_URL')?.replace(/\/$/, '') ||
      'https://app.apigateway.cl/api/v2';
    const url = `${baseUrl}/sii/eboleta/emitidas/emitir`;

    const payload = this.buildPayload(
      rutAutenticador,
      rutEmisor,
      claveTributaria,
      codigoSucursal,
      saleData,
    );

    this.logger.log(`Emitiendo eBoleta: ${saleData.items.length} ítems, total estimado ${saleData.items.reduce((s, i) => s + i.precio_unitario * i.cantidad, 0)}`);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Token ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      const data = this.parseJson(responseText);

      if (!response.ok) {
        const errorMessage = this.extractErrorMessage(data, responseText, response.status);
        this.logger.error(`API Gateway HTTP ${response.status}: ${errorMessage}`);
        if (response.status === 401 || response.status === 403) {
          throw new SiiCredentialError(
            `API Gateway rechazó token o credenciales (HTTP ${response.status}): ${errorMessage}`,
          );
        }
        if (response.status === 400) {
          throw new SiiPermanentError(
            `API Gateway rechazó la emisión (HTTP ${response.status}): ${errorMessage}`,
          );
        }
        throw new Error(errorMessage);
      }

      this.logger.log(`API Gateway response OK: ${JSON.stringify(data).substring(0, 500)}`);
      return this.parseEmitResult(data);
    } catch (error) {
      if (error instanceof SiiCredentialError) throw error;
      if (error instanceof SiiPermanentError) throw error;
      const message = error instanceof Error ? error.message : 'Error desconocido';
      this.logger.error(`Error emitiendo eBoleta en API Gateway: ${message}`);
      throw new Error(`Error API Gateway: ${message}`);
    }
  }

  private buildPayload(
    rutAutenticador: string,
    rutEmisor: string,
    claveTributaria: string,
    codigoSucursal: number,
    saleData: SiiSaleData,
  ): Record<string, unknown> {
    return {
      auth: {
        pass: {
          rut: rutAutenticador,
          clave: claveTributaria,
        },
      },
      dte: {
        vendedor: rutEmisor,
        Encabezado: {
          IdDoc: {
            TipoDTE: 39,
            MedioPago: this.resolveMedioPago(saleData.payment_method),
          },
          Emisor: {
            RUTEmisor: rutEmisor,
            CdgSIISucur: codigoSucursal,
          },
          Receptor: {
            RUTRecep: '66666666-6',
            RznSocRecep: 'Cliente Publico',
            DirRecep: 'Santiago',
          },
        },
        Detalle: this.buildDetalle(saleData),
      },
    };
  }

  private resolveMedioPago(paymentMethod?: PaymentMethod): number {
    return paymentMethod === PaymentMethod.TARJETA ? 2 : 1;
  }

  private buildDetalle(saleData: SiiSaleData): Array<Record<string, unknown>> {
    // API Gateway puede tener límite de ítems.
    // Si hay 1 ítem, lo enviamos detallado. Si hay más, consolidamos en 1 línea.
    if (saleData.items.length === 1) {
      const item = saleData.items[0];
      const isIntegerQuantity = Number.isInteger(item.cantidad);
      return [{
        NmbItem: this.sanitizeItemName(
          isIntegerQuantity
            ? item.nombre
            : `${item.nombre} ${item.cantidad.toFixed(3)}kg`,
        ),
        QtyItem: isIntegerQuantity ? item.cantidad : 1,
        PrcItem: isIntegerQuantity
          ? Math.round(item.precio_unitario)
          : Math.round(item.subtotal),
      }];
    }

    // Consolidar múltiples ítems en una sola línea con el total
    const total = saleData.items.reduce(
      (sum, item) => sum + Math.round(item.precio_unitario * item.cantidad),
      0,
    );
    const count = saleData.items.length;
    return [{
      NmbItem: `Venta ${count} productos`,
      QtyItem: 1,
      PrcItem: total,
    }];
  }

  private normalizeRut(rut: string): string {
    return rut.replace(/\./g, '').trim();
  }

  private sanitizeItemName(name: string): string {
    // SII NmbItem max 40 chars.
    // Normalize accented chars and remove problematic characters for XML/JSON.
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')  // Remove accents (á→a, ñ→n, etc.)
      .replace(/['"<>&]/g, '')
      .trim()
      .substring(0, 40);
  }

  private parseJson(responseText: string): any {
    try {
      return JSON.parse(responseText);
    } catch {
      return null;
    }
  }

  private extractErrorMessage(data: any, responseText: string, status: number): string {
    const message = (
      data?.message ||
      data?.detail ||
      data?.error ||
      responseText ||
      `HTTP ${status}`
    );
    return String(message).replace(/\s+/g, ' ').trim().substring(0, 500);
  }

  private parseEmitResult(data: any): SiiEmitResult {
    const result = data?.data || data?.documento || data?.dte || data || {};
    const folio = this.pickString(result, [
      'folio',
      'Folio',
      'FOLIO',
      'documento.folio',
      'dte.folio',
    ]);
    if (!folio) {
      throw new Error('API Gateway no retornó folio de boleta');
    }

    const pdfUrl = this.pickString(result, [
      'pdf_url',
      'pdfUrl',
      'PDF',
      'pdf',
      'url_pdf',
      'urlPdf',
      'documento.pdf_url',
      'documento.pdf',
      'dte.pdf_url',
      'dte.pdf',
    ]);
    const timbre = this.pickString(result, [
      'timbre_electronico',
      'timbreElectronico',
      'timbre',
      'TIMBRE',
      'ted',
      'TED',
      'xml_ted',
      'xmlTed',
      'timbre_pdf417',
      'timbrePdf417',
      'pdf417',
      'codigo_barras',
      'codigoBarras',
      'codigo',
      'barcode',
      'documento.timbre_electronico',
      'documento.timbre',
      'documento.TED',
      'dte.timbre_electronico',
      'dte.timbre',
      'dte.TED',
    ]);

    if (!timbre) {
      this.logger.warn(`API Gateway no retornó timbre electrónico para folio ${folio}. Se usará placeholder.`);
    }

    return {
      folio: String(folio),
      pdf_url: typeof pdfUrl === 'string' && pdfUrl.startsWith('http') ? pdfUrl : null,
      timbre_electronico: timbre
        ? String(timbre)
        : `<EBOLETA><PROVEEDOR>api_gateway</PROVEEDOR><FOLIO>${folio}</FOLIO></EBOLETA>`,
    };
  }

  private pickString(source: any, paths: string[]): string | null {
    for (const path of paths) {
      const value = this.getPath(source, path);
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        return String(value);
      }
    }
    return null;
  }

  private getPath(source: any, path: string): unknown {
    return path.split('.').reduce((current, key) => {
      if (current == null || typeof current !== 'object') {
        return undefined;
      }
      return current[key];
    }, source);
  }
}
