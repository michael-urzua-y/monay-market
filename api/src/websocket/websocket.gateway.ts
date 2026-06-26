import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

function parseAllowedOrigins(value?: string): string[] | boolean {
  if (!value) return true;
  const origins = value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  return origins.length > 0 ? origins : true;
}

@SkipThrottle()
@WebSocketGateway({
  cors: {
    origin: parseAllowedOrigins(process.env.WS_CORS_ORIGIN || process.env.CORS_ORIGIN),
  },
})
export class AppWebSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AppWebSocketGateway.name);
  private readonly tokenExpiryTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly configService: ConfigService) {}

  handleConnection(client: Socket): void {
    try {
      const payload = this.authenticateClient(client);
      const tenantRoom = `tenant:${payload.tenant_id}`;
      client.join(tenantRoom);
      client.data = { ...payload };

      // Schedule disconnection when JWT expires
      this.scheduleTokenExpiry(client);

      this.logger.log(
        `Client connected: ${client.id} | tenant: ${payload.tenant_id}`,
      );
    } catch {
      this.logger.warn(`Client rejected: ${client.id} — invalid token`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const timer = this.tokenExpiryTimers.get(client.id);
    if (timer) {
      clearTimeout(timer);
      this.tokenExpiryTimers.delete(client.id);
    }
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitToTenant(tenantId: string, event: string, data: unknown): void {
    this.server.to(`tenant:${tenantId}`).emit(event, data);
  }

  private authenticateClient(client: Socket): JwtPayload {
    const token = client.handshake.auth?.token;

    if (!token || typeof token !== 'string') {
      throw new Error('No token provided');
    }

    const secret = this.configService.getOrThrow<string>('JWT_SECRET');
    const decoded = jwt.verify(token, secret) as JwtPayload;

    if (!decoded.user_id || !decoded.tenant_id || !decoded.role) {
      throw new Error('Invalid token payload');
    }

    return decoded;
  }

  private scheduleTokenExpiry(client: Socket): void {
    const token = client.handshake.auth?.token;
    if (!token) return;

    try {
      const decoded = jwt.decode(token) as { exp?: number } | null;
      if (!decoded?.exp) return;

      const now = Math.floor(Date.now() / 1000);
      const ttlMs = (decoded.exp - now) * 1000;

      if (ttlMs <= 0) {
        client.emit('token_expired');
        client.disconnect(true);
        return;
      }

      const timer = setTimeout(() => {
        client.emit('token_expired');
        client.disconnect(true);
        this.tokenExpiryTimers.delete(client.id);
      }, ttlMs);

      this.tokenExpiryTimers.set(client.id, timer);
    } catch {
      // If decode fails, connection is already rejected by authenticateClient
    }
  }
}
