import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Sale } from '../entities/sale.entity';
import { SaleLine } from '../entities/sale-line.entity';
import { Product } from '../entities/product.entity';
import { Tenant } from '../entities/tenant.entity';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { ReceiptService } from './receipt.service';
import { SiiModule } from '../sii/sii.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Sale, SaleLine, Product, Tenant]),
    SiiModule,
  ],
  controllers: [SalesController],
  providers: [SalesService, ReceiptService],
  exports: [SalesService],
})
export class SalesModule {}
