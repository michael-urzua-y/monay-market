import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  OneToOne,
} from 'typeorm';
import { TenantConfig } from './tenant-config.entity';
import { Subscription } from './subscription.entity';
import { User } from './user.entity';
import { Category } from './category.entity';
import { Product } from './product.entity';
import { Sale } from './sale.entity';
import { Boleta } from './boleta.entity';

@Entity('tenants', { schema: 'market' })
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 20 })
  rut: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @OneToOne(() => TenantConfig, (config) => config.tenant)
  config: TenantConfig;

  @OneToOne(() => Subscription, (subscription) => subscription.tenant)
  subscription: Subscription;

  @OneToMany(() => User, (user) => user.tenant)
  users: User[];

  @OneToMany(() => Category, (category) => category.tenant)
  categories: Category[];

  @OneToMany(() => Product, (product) => product.tenant)
  products: Product[];

  @OneToMany(() => Sale, (sale) => sale.tenant)
  sales: Sale[];

  @OneToMany(() => Boleta, (boleta) => boleta.tenant)
  boletas: Boleta[];
}
