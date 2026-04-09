import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class AppWebSocketGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AppWebSocketGateway.name);

  constructor(private readonly configService: ConfigService) {}

  handleConnection(client: Socket): void {
    try {
      const payload = this.authenticateClient(client);
      const tenantRoom = `tenant:${payload.tenant_id}`;
      client.join(tenantRoom);
      client.data = { ...payload };
      this.logger.log(
        `Client connected: ${client.id} | tenant: ${payload.tenant_id}`,
      );
    } catch {
      this.logger.warn(`Client rejected: ${client.id} — invalid token`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitToTenant(tenantId: string, event: string, data: unknown): void {
    this.server.to(`tenant:${tenantId}`).emit(event, data);
  }

  private authenticateClient(client: Socket): JwtPayload {
    const token =
      client.handshake.auth?.token ??
      client.handshake.query?.token;

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
}
