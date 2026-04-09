import { Test, TestingModule } from '@nestjs/testing';
import { EventsService } from './events.service';
import { AppWebSocketGateway } from './websocket.gateway';

describe('EventsService', () => {
  let service: EventsService;
  let gateway: AppWebSocketGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: AppWebSocketGateway,
          useValue: {
            emitToTenant: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    gateway = module.get<AppWebSocketGateway>(AppWebSocketGateway);
  });

  it('should emit sale:created to the correct tenant', () => {
    const saleData = { sale_id: 's1', total: 15000 };
    service.emitSaleCreated('t1', saleData);
    expect(gateway.emitToTenant).toHaveBeenCalledWith(
      't1',
      'sale:created',
      saleData,
    );
  });

  it('should emit stock:updated to the correct tenant', () => {
    const productData = { product_id: 'p1', stock: 8 };
    service.emitStockUpdated('t2', productData);
    expect(gateway.emitToTenant).toHaveBeenCalledWith(
      't2',
      'stock:updated',
      productData,
    );
  });

  it('should emit stock:critical to the correct tenant', () => {
    const alerts = [
      { product_id: 'p1', current_stock: 1, critical_stock: 5 },
    ];
    service.emitStockCritical('t3', alerts);
    expect(gateway.emitToTenant).toHaveBeenCalledWith(
      't3',
      'stock:critical',
      alerts,
    );
  });
});
