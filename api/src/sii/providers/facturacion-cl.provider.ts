import { Injectable } from '@nestjs/common';
import { SiiProvider } from '../../entities/enums';
import {
  ISiiProvider,
  SiiSaleData,
  SiiEmitResult,
} from '../interfaces/sii-provider.interface';

@Injectable()
export class FacturacionClProvider implements ISiiProvider {
  readonly providerName = SiiProvider.FACTURACION_CL;

  async emitBoleta(
    apiKey: string,
    saleData: SiiSaleData,
    sandbox: boolean,
  ): Promise<SiiEmitResult> {
    // Stub: real implementation will call Facturacion.cl API via HttpService
    throw new Error('Facturacion.cl provider not yet implemented');
  }
}
