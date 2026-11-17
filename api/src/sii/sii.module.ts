import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantConfig } from '../entities/tenant-config.entity';
import { Sale } from '../entities/sale.entity';
import { Boleta } from '../entities/boleta.entity';
import { SiiService } from './sii.service';
import { SiiController } from './sii.controller';
import { ApiGatewayProvider } from './providers/api-gateway.provider';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([TenantConfig, Sale, Boleta]),
  ],
  controllers: [SiiController],
  providers: [SiiService, ApiGatewayProvider],
  exports: [SiiService],
})
export class SiiModule {}
