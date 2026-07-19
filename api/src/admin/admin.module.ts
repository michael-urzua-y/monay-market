import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { Tenant } from '../entities/tenant.entity';
import { User } from '../entities/user.entity';
import { Subscription } from '../entities/subscription.entity';
import { TenantConfig } from '../entities/tenant-config.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, User, Subscription, TenantConfig]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
