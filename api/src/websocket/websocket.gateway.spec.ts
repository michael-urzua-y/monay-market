import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppWebSocketGateway } from './websocket.gateway';
import * as jwt from 'jsonwebtoken';
import { Socket, Server } from 'socket.io';

const JWT_SECRET = 'test-secret-key';

function createMockSocket(overrides: Partial<Socket> = {}): Socket {
  return {
    id: 'socket-1',
    handshake: { auth: {}, query: {} },
    join: jest.fn(),
    disconnect: jest.fn(),
    data: {},
    ...overrides,
  } as unknown as Socket;
}

function signToken(payload: Record<string, unknown>): string {
  return jwt.sign(payload, JWT_SECRET);
}

describe('AppWebSocketGateway', () => {
  let gateway: AppWebSocketGateway;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppWebSocketGateway,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue(JWT_SECRET),
          },
        },
      ],
    }).compile();

    gateway = module.get<AppWebSocketGateway>(AppWebSocketGateway);

    // Attach a mock server
    gateway.server = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    } as unknown as Server;
  });

  describe('handleConnection', () => {
    it('should authenticate and join tenant room when token is in handshake.auth', () => {
      const token = signToken({
        user_id: 'u1',
        role: 'dueno',
        tenant_id: 't1',
      });
      const client = createMockSocket({
        handshake: { auth: { token }, query: {} } as any,
      });

      gateway.handleConnection(client);

      expect(client.join).toHaveBeenCalledWith('tenant:t1');
      expect(client.data).toEqual(
        expect.objectContaining({
          user_id: 'u1',
          role: 'dueno',
          tenant_id: 't1',
        }),
      );
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('should authenticate when token is in handshake.query', () => {
      const token = signToken({
        user_id: 'u2',
        role: 'cajero',
        tenant_id: 't2',
      });
      const client = createMockSocket({
        handshake: { auth: {}, query: { token } } as any,
      });

      gateway.handleConnection(client);

      expect(client.join).toHaveBeenCalledWith('tenant:t2');
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('should disconnect client when no token is provided', () => {
      const client = createMockSocket();

      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('should disconnect client when token is invalid', () => {
      const client = createMockSocket({
        handshake: { auth: { token: 'bad-token' }, query: {} } as any,
      });

      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('should disconnect client when token payload is missing required fields', () => {
      const token = signToken({ user_id: 'u1' }); // missing tenant_id and role
      const client = createMockSocket({
        handshake: { auth: { token }, query: {} } as any,
      });

      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
    });
  });

  describe('emitToTenant', () => {
    it('should emit event to the correct tenant room', () => {
      const data = { sale_id: 's1', total: 5000 };

      gateway.emitToTenant('t1', 'sale:created', data);

      expect(gateway.server.to).toHaveBeenCalledWith('tenant:t1');
      expect(gateway.server.to('tenant:t1').emit).toHaveBeenCalledWith(
        'sale:created',
        data,
      );
    });

    it('should emit stock:updated to the correct tenant room', () => {
      const data = { product_id: 'p1', stock: 10 };

      gateway.emitToTenant('t2', 'stock:updated', data);

      expect(gateway.server.to).toHaveBeenCalledWith('tenant:t2');
      expect(gateway.server.to('tenant:t2').emit).toHaveBeenCalledWith(
        'stock:updated',
        data,
      );
    });

    it('should emit stock:critical to the correct tenant room', () => {
      const alerts = [{ product_id: 'p1', current_stock: 2, critical_stock: 5 }];

      gateway.emitToTenant('t3', 'stock:critical', alerts);

      expect(gateway.server.to).toHaveBeenCalledWith('tenant:t3');
      expect(gateway.server.to('tenant:t3').emit).toHaveBeenCalledWith(
        'stock:critical',
        alerts,
      );
    });
  });

  describe('handleDisconnect', () => {
    it('should handle disconnect without errors', () => {
      const client = createMockSocket();
      expect(() => gateway.handleDisconnect(client)).not.toThrow();
    });
  });
});
