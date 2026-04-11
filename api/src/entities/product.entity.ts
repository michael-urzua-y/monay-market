import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { Category } from './category.entity';
import { SaleLine } from './sale-line.entity';

@Entity('products', { schema: 'market' })
@Index('IDX_product_tenant_barcode', ['tenant_id', 'barcode'], { unique: true })
@Index('IDX_product_tenant_active_stock', ['tenant_id', 'active', 'stock'])
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenant_id: string;

  @Column({ name: 'category_id', type: 'uuid', nullable: true })
  category_id: string | null;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  barcode: string | null;

  @Column({ type: 'integer' })
  price: number;

  @Column({ type: 'numeric', precision: 10, scale: 3, default: 0, transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) } })
  stock: number;

  @Column({ name: 'critical_stock', type: 'numeric', precision: 10, scale: 3, default: 0, transformer: { to: (v: number) => v, from: (v: string) => parseFloat(v) } })
  critical_stock: number;

  @Column({ type: 'boolean', default: false })
  is_weighed: boolean;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @ManyToOne(() => Tenant, (tenant) => tenant.products, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => Category, (category) => category.products, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'category_id' })
  category: Category | null;

  @OneToMany(() => SaleLine, (saleLine) => saleLine.product)
  sale_lines: SaleLine[];
}
