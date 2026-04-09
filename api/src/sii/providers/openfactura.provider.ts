import { Injectable } from '@nestjs/common';
import { SiiProvider } from '../../entities/enums';
import {
  ISiiProvider,
  SiiSaleData,
  SiiEmitResult,
} from '../interfaces/sii-provider.interface';

@Injectable()
export class OpenFacturaProvider implements ISiiProvider {
  readonly providerName = SiiProvider.OPENFACTURA;

  async emitBoleta(
    apiKey: string,
    saleData: SiiSaleData,
    sandbox: boolean,
  ): Promise<SiiEmitResult> {
    // Stub: real implementation will call OpenFactura API via HttpService
    throw new Error('OpenFactura provider not yet implemented');
  }
}
