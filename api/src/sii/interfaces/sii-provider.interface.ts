import { SiiProvider } from '../../entities/enums';

export interface SiiSaleData {
  sale_id: string;
  rut_emisor: string;
  items: SiiSaleItem[];
  monto_neto: number;
  iva: number;
  monto_total: number;
  fecha: Date;
}

export interface SiiSaleItem {
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface SiiEmitResult {
  folio: string;
  timbre_electronico: string;
  pdf_url: string | null;
}

export interface ISiiProvider {
  readonly providerName: SiiProvider;
  emitBoleta(
    apiKey: string,
    saleData: SiiSaleData,
    sandbox: boolean,
  ): Promise<SiiEmitResult>;
}

export class SiiCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SiiCredentialError';
  }
}
