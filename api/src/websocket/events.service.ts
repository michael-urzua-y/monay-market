import { Injectable } from '@nestjs/common';
import { AppWebSocketGateway } from './websocket.gateway';

@Injectable()
export class EventsService {
  constructor(private readonly gateway: AppWebSocketGateway) {}

  emitSaleCreated(tenantId: string, saleData: unknown): void {
    this.gateway.emitToTenant(tenantId, 'sale:created', saleData);
  }

  emitStockUpdated(tenantId: string, productData: unknown): void {
    this.gateway.emitToTenant(tenantId, 'stock:updated', productData);
  }

  emitStockCritical(tenantId: string, alerts: unknown): void {
    this.gateway.emitToTenant(tenantId, 'stock:critical', alerts);
  }
}
