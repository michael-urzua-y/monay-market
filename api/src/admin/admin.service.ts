import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Tenant } from '../entities/tenant.entity';
import { User } from '../entities/user.entity';
import { Subscription } from '../entities/subscription.entity';
import { TenantConfig } from '../entities/tenant-config.entity';
import { UserRole, SubscriptionPlan, SubscriptionStatus } from '../entities/enums';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(TenantConfig)
    private readonly tenantConfigRepository: Repository<TenantConfig>,
    private readonly dataSource: DataSource,
  ) {}

  async findAllTenants() {
    const tenants = await this.tenantRepository.find({
      order: { created_at: 'DESC' },
    });

    const result: any[] = [];
    for (const tenant of tenants) {
      const subscription = await this.subscriptionRepository.findOne({
        where: { tenant_id: tenant.id },
      });
      const userCount = await this.userRepository.count({
        where: { tenant_id: tenant.id },
      });

      result.push({
        id: tenant.id,
        name: tenant.name,
        rut: tenant.rut,
        created_at: tenant.created_at,
        user_count: userCount,
        plan: subscription?.plan || null,
        subscription_status: subscription?.status || null,
        subscription_end: subscription?.end_date || null,
      });
    }

    return result;
  }

  async findOneTenant(tenantId: string) {
    const tenant = await this.tenantRepository.findOne({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');

    const users = await this.userRepository.find({
      where: { tenant_id: tenantId },
      order: { created_at: 'DESC' },
      select: ['id', 'username', 'email', 'role', 'active', 'created_at'],
    });

    const subscription = await this.subscriptionRepository.findOne({
      where: { tenant_id: tenantId },
    });

    const config = await this.tenantConfigRepository.findOne({
      where: { tenant_id: tenantId },
    });

    // Basic metrics
    const productCount = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM market.products WHERE tenant_id = $1 AND active = true`,
      [tenantId],
    );
    const salesMonth = await this.dataSource.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total FROM market.sales WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
      [tenantId],
    );

    return {
      id: tenant.id,
      name: tenant.name,
      rut: tenant.rut,
      created_at: tenant.created_at,
      users,
      subscription: subscription ? {
        plan: subscription.plan,
        status: subscription.status,
        start_date: subscription.start_date,
        end_date: subscription.end_date,
      } : null,
      config: config ? {
        sii_enabled: config.sii_enabled,
        sii_provider: config.sii_provider,
        sii_razon_social: config.sii_razon_social,
        printer_enabled: config.printer_enabled,
      } : null,
      metrics: {
        active_products: parseInt(productCount[0]?.count || '0', 10),
        sales_last_30_days: parseInt(salesMonth[0]?.count || '0', 10),
        revenue_last_30_days: parseInt(salesMonth[0]?.total || '0', 10),
      },
    };
  }

  async createTenant(data: {
    name: string;
    rut: string;
    owner_username: string;
    owner_password: string;
  }) {
    if (!data.name || !data.rut || !data.owner_username || !data.owner_password) {
      throw new BadRequestException('Todos los campos son obligatorios');
    }

    return this.dataSource.transaction(async (manager) => {
      const tenant = manager.create(Tenant, {
        name: data.name.trim(),
        rut: data.rut.trim(),
      });
      const savedTenant = await manager.save(Tenant, tenant);

      const passwordHash = await bcrypt.hash(data.owner_password, 10);
      const owner = manager.create(User, {
        tenant_id: savedTenant.id,
        username: data.owner_username.trim().toLowerCase(),
        email: data.owner_username.trim().toLowerCase(),
        password_hash: passwordHash,
        role: UserRole.DUENO,
        active: true,
      });
      await manager.save(User, owner);

      // Create default subscription
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + 1);
      const subscription = manager.create(Subscription, {
        tenant_id: savedTenant.id,
        plan: SubscriptionPlan.BASICO,
        status: SubscriptionStatus.ACTIVA,
        start_date: new Date(),
        end_date: endDate,
      });
      await manager.save(Subscription, subscription);

      // Create default config
      const config = manager.create(TenantConfig, {
        tenant_id: savedTenant.id,
        sii_enabled: false,
        printer_enabled: false,
      });
      await manager.save(TenantConfig, config);

      return { id: savedTenant.id, name: savedTenant.name, rut: savedTenant.rut };
    });
  }

  async updateTenant(tenantId: string, data: { name?: string; blocked?: boolean }) {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');

    if (data.name !== undefined) tenant.name = data.name.trim();

    // Block/unblock: deactivate all users of the tenant
    if (data.blocked !== undefined) {
      await this.userRepository.update(
        { tenant_id: tenantId },
        { active: !data.blocked },
      );
    }

    await this.tenantRepository.save(tenant);
    return { ok: true };
  }

  async updateSubscription(tenantId: string, data: { plan?: string; status?: string; end_date?: string }) {
    let subscription = await this.subscriptionRepository.findOne({
      where: { tenant_id: tenantId },
    });

    if (!subscription) {
      subscription = this.subscriptionRepository.create({
        tenant_id: tenantId,
        plan: (data.plan as SubscriptionPlan) || SubscriptionPlan.BASICO,
        status: (data.status as SubscriptionStatus) || SubscriptionStatus.ACTIVA,
        start_date: new Date(),
        end_date: data.end_date ? new Date(data.end_date) : new Date(Date.now() + 365 * 86400000),
      });
    } else {
      if (data.plan) subscription.plan = data.plan as SubscriptionPlan;
      if (data.status) subscription.status = data.status as SubscriptionStatus;
      if (data.end_date) subscription.end_date = new Date(data.end_date);
    }

    await this.subscriptionRepository.save(subscription);
    return { ok: true };
  }

  async updateUser(tenantId: string, userId: string, data: { username?: string; active?: boolean; password?: string }) {
    const user = await this.userRepository.findOne({
      where: { id: userId, tenant_id: tenantId },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    if (data.username !== undefined) {
      user.username = data.username.trim().toLowerCase();
      user.email = user.username;
    }
    if (data.active !== undefined) {
      user.active = data.active;
    }
    if (data.password) {
      user.password_hash = await bcrypt.hash(data.password, 10);
    }

    await this.userRepository.save(user);
    return { ok: true, username: user.username, active: user.active };
  }

  async deleteTenant(tenantId: string) {
    const tenant = await this.tenantRepository.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant no encontrado');

    // Deactivate all users (soft delete approach)
    await this.userRepository.update({ tenant_id: tenantId }, { active: false });

    // Mark subscription as cancelled
    await this.subscriptionRepository.update(
      { tenant_id: tenantId },
      { status: SubscriptionStatus.CANCELADA },
    );

    return { ok: true, message: 'Tenant bloqueado y suscripción cancelada' };
  }

  async getStats() {
    const totalTenants = await this.tenantRepository.count();
    const activeSubscriptions = await this.subscriptionRepository.count({
      where: { status: SubscriptionStatus.ACTIVA },
    });
    const totalUsers = await this.userRepository.count();

    return {
      total_tenants: totalTenants,
      active_subscriptions: activeSubscriptions,
      total_users: totalUsers,
    };
  }
}
