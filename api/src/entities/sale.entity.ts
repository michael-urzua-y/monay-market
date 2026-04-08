import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  OneToOne,
  Index,
} from 'typeorm';
import { Tenant } from './tenant.entity';
import { User } from './user.entity';
import { SaleLine } from './sale-line.entity';
import { Boleta } from './boleta.entity';
import { PaymentMethod, BoletaStatus } from './enums';

@Entity('sales', { schema: 'market' })
@Index('IDX_sale_tenant_created_at', ['tenant_id', 'created_at'])
@Index('IDX_sale_tenant_boleta_status', ['tenant_id', 'boleta_status'])
export class Sale {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenant_id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  user_id: string;

  @Column({ type: 'integer' })
  total: number;

  @Column({
    name: 'payment_method',
    type: 'enum',
    enum: PaymentMethod,
  })
  payment_method: PaymentMethod;

  @Column({ name: 'amount_received', type: 'integer', nullable: true })
  amount_received: number | null;

  @Column({ name: 'change_amount', type: 'integer', nullable: true })
  change_amount: number | null;

  @Column({
    name: 'boleta_status',
    type: 'enum',
    enum: BoletaStatus,
    default: BoletaStatus.NO_APLICA,
  })
  boleta_status: BoletaStatus;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @ManyToOne(() => Tenant, (tenant) => tenant.sales, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => User, (user) => user.sales, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @OneToMany(() => SaleLine, (saleLine) => saleLine.sale, { cascade: true })
  lines: SaleLine[];

  @OneToOne(() => Boleta, (boleta) => boleta.sale)
  boleta: Boleta;
}
