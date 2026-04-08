import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { SiiProvider } from './enums';

@Entity('tenant_configs')
export class TenantConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenant_id: string;

  @Column({ name: 'sii_enabled', type: 'boolean', default: false })
  sii_enabled: boolean;

  @Column({
    name: 'sii_provider',
    type: 'enum',
    enum: SiiProvider,
    nullable: true,
  })
  sii_provider: SiiProvider | null;

  @Column({ name: 'sii_api_key', type: 'varchar', length: 512, nullable: true })
  sii_api_key: string | null;

  @Column({ name: 'sii_rut_emisor', type: 'varchar', length: 20, nullable: true })
  sii_rut_emisor: string | null;

  @Column({ name: 'sii_sandbox_mode', type: 'boolean', default: true })
  sii_sandbox_mode: boolean;

  @Column({ name: 'printer_enabled', type: 'boolean', default: false })
  printer_enabled: boolean;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @OneToOne(() => Tenant, (tenant) => tenant.config, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;
}
