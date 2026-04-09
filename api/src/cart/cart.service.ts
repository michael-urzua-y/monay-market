import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { ValidateCartDto } from './dto/validate-cart.dto';

export interface ValidatedCartLine {
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  available_stock: number;
}

export interface StockError {
  product_id: string;
  requested: number;
  available: number;
}

export interface ValidatedCartResult {
  lines: ValidatedCartLine[];
  total: number;
  valid: boolean;
  errors: StockError[];
}

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
  ) {}

  async validate(
    tenantId: string,
    dto: ValidateCartDto,
  ): Promise<ValidatedCartResult> {
    const validatedLines: ValidatedCartLine[] = [];
    const errors: StockError[] = [];

    for (const line of dto.lines) {
      const product = await this.productRepository.findOne({
        where: { id: line.product_id, tenant_id: tenantId, active: true },
      });

      if (!product) {
        throw new NotFoundException(
          `Producto ${line.product_id} no encontrado`,
        );
      }

      if (line.quantity > product.stock) {
        errors.push({
          product_id: product.id,
          requested: line.quantity,
          available: product.stock,
        });
      }

      const subtotal = line.quantity * product.price;

      validatedLines.push({
        product_id: product.id,
        product_name: product.name,
        unit_price: product.price,
        quantity: line.quantity,
        subtotal,
        available_stock: product.stock,
      });
    }

    const total = validatedLines.reduce((sum, l) => sum + l.subtotal, 0);

    return {
      lines: validatedLines,
      total,
      valid: errors.length === 0,
      errors,
    };
  }
}
