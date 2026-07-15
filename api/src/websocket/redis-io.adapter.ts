import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';

/**
 * Adapter de Socket.IO respaldado por Redis.
 *
 * Permite que los eventos WebSocket (sale:created, stock:updated, etc.) se
 * propaguen entre varias réplicas del API. Solo se usa si WS_REDIS_URL está
 * definida; en una sola instancia no hace falta y se mantiene el adapter en
 * memoria por defecto.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl: string,
  ) {
    super(app);
  }

  async connectToRedis(): Promise<void> {
    const pubClient = createClient({ url: this.redisUrl });
    const subClient = pubClient.duplicate();

    pubClient.on('error', (err) => this.logger.error(`Redis pub error: ${err}`));
    subClient.on('error', (err) => this.logger.error(`Redis sub error: ${err}`));

    await Promise.all([pubClient.connect(), subClient.connect()]);
    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log('WebSocket conectado a Redis (multi-réplica habilitado)');
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
