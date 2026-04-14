import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MermasService } from './mermas.service';
import { MermasController } from './mermas.controller';
import { Merma } from '../entities/merma.entity';
import { Product } from '../entities/product.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Merma, Product])],
  controllers: [MermasController],
  providers: [MermasService],
  exports: [MermasService],
})
export class MermasModule {}