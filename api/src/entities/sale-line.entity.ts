import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Sale } from './sale.entity';
import { Product } from './product.entity';

@Entity('sale_lines', { schema: 'market' })
export class SaleLine {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sale_id', type: 'uuid' })
  sale_id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  product_id: string;

  @Column({ name: 'product_name', type: 'varchar', length: 255 })
  product_name: string;

  @Column({ name: 'unit_price', type: 'integer' })
  unit_price: number;

  @Column({ type: 'numeric', precision: 10, scale: 3, transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) } })
  quantity: number;

  @Column({ type: 'integer' })
  subtotal: number;

  @ManyToOne(() => Sale, (sale) => sale.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @ManyToOne(() => Product, (product) => product.sale_lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;
}
