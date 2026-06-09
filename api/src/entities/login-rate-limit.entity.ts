import {
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('login_rate_limits', { schema: 'market' })
export class LoginRateLimit {
  @PrimaryColumn({ name: 'key', type: 'varchar', length: 320 })
  key: string;

  @Column({ name: 'attempts', type: 'integer', default: 0 })
  attempts: number;

  @Column({ name: 'reset_at', type: 'timestamptz' })
  reset_at: Date;

  @Column({ name: 'blocked_until', type: 'timestamptz', nullable: true })
  blocked_until: Date | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
