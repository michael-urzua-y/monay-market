import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Sale } from './sale.entity';
import { Tenant } from './tenant.entity';
import { SiiProvider } from './enums';

@Entity('boletas', { schema: 'market' })
export class Boleta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'sale_id', type: 'uuid' })
  sale_id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenant_id: string;

  @Column({ type: 'varchar', length: 100 })
  folio: string;

  @Column({ name: 'timbre_electronico', type: 'text' })
  timbre_electronico: string;

  @Column({ name: 'pdf_url', type: 'varchar', length: 512, nullable: true })
  pdf_url: string | null;

  @Column({ type: 'enum', enum: SiiProvider })
  provider: SiiProvider;

  @Column({ name: 'emitted_at', type: 'timestamp' })
  emitted_at: Date;

  @OneToOne(() => Sale, (sale) => sale.boleta, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sale_id' })
  sale: Sale;

  @ManyToOne(() => Tenant, (tenant) => tenant.boletas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
