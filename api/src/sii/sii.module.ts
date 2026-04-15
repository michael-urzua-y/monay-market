import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { TenantConfig } from '../entities/tenant-config.entity';
import { Sale } from '../entities/sale.entity';
import { Boleta } from '../entities/boleta.entity';
import { SiiService } from './sii.service';
import { SiiController } from './sii.controller';
import { HaulmerProvider } from './providers/haulmer.provider';
import { OpenFacturaProvider } from './providers/openfactura.provider';
import { FacturacionClProvider } from './providers/facturacion-cl.provider';
import { SimpleApiProvider } from './providers/simple-api.provider';
import { BaseApiProvider } from './providers/base-api.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([TenantConfig, Sale, Boleta]),
    HttpModule.register({ timeout: 15000 }),
  ],
  controllers: [SiiController],
  providers: [
    SiiService,
    HaulmerProvider,
    OpenFacturaProvider,
    FacturacionClProvider,
    SimpleApiProvider,
    BaseApiProvider,
  ],
  exports: [SiiService],
})
export class SiiModule {}
