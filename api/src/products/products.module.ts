import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { Product } from '../entities/product.entity';
import { PriceHistory } from '../entities/price-history.entity';
import { SaleLine } from '../entities/sale-line.entity';
import { Category } from '../entities/category.entity';
import { ProductReception } from '../entities/product-reception.entity';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Product, PriceHistory, SaleLine, Category, ProductReception]),
    HttpModule,
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
