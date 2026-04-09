import { Injectable } from '@nestjs/common';
import { SiiProvider } from '../../entities/enums';
import {
  ISiiProvider,
  SiiSaleData,
  SiiEmitResult,
} from '../interfaces/sii-provider.interface';

@Injectable()
export class HaulmerProvider implements ISiiProvider {
  readonly providerName = SiiProvider.HAULMER;

  async emitBoleta(
    apiKey: string,
    saleData: SiiSaleData,
    sandbox: boolean,
  ): Promise<SiiEmitResult> {
    // Stub: real implementation will call Haulmer API via HttpService
    throw new Error('Haulmer provider not yet implemented');
  }
}
