import { Module } from '@nestjs/common';
import { AppWebSocketGateway } from './websocket.gateway';
import { EventsService } from './events.service';

@Module({
  providers: [AppWebSocketGateway, EventsService],
  exports: [EventsService],
})
export class WebSocketModule {}
