import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { Product } from './product.entity';

export enum MermaCause {
  VENCIDO = 'vencido',
  ROTO = 'roto',
  ROBO = 'robo',
  CONSUMO_INTERNO = 'consumo_interno',
}

@Entity('mermas', { schema: 'market' })
@Index('IDX_merma_tenant_created', ['tenant_id', 'created_at'])
export class Merma {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenant_id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  product_id: string;

  @Column({ type: 'numeric', precision: 10, scale: 3 })
  quantity: number;

  @Column({ type: 'enum', enum: MermaCause })
  cause: MermaCause;

  @Column({ type: 'integer' })
  value_loss: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @ManyToOne(() => Tenant, (tenant) => tenant.mermas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => Product, (product) => product.id, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;
}