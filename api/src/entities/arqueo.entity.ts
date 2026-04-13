import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';

@Entity('arqueos', { schema: 'market' })
export class Arqueo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenant_id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  user_id: string;

  @Column({ type: 'integer' })
  expected_amount: number;

  @Column({ type: 'integer' })
  counted_amount: number;

  @Column({ type: 'integer' })
  difference: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;
}