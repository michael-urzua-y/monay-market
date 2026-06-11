import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('price_history', { schema: 'market' })
export class PriceHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  product_id: string;

  @Column({ name: 'old_price', type: 'integer' })
  old_price: number;

  @Column({ name: 'new_price', type: 'integer' })
  new_price: number;

  @Column({ name: 'changed_by', type: 'uuid', nullable: true })
  changed_by: string | null;

  @CreateDateColumn({ name: 'changed_at' })
  changed_at: Date;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;
}
