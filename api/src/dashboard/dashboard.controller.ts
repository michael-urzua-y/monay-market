import { Controller, Get, UseGuards, Query } from '@nestjs/common';
import {
  JwtAuthGuard,
  TenantGuard,
  RolesGuard,
  SubscriptionGuard,
  PlanGuard,
} from '../common/guards';
import { Roles, CurrentUser, RequiredPlan } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import {
  DashboardService,
  TodayMetrics,
  MonthlyMetrics,
  DailyChartEntry,
  InventoryValue,
} from './dashboard.service';
import { Product } from '../entities/product.entity';

@Controller('dashboard')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard, SubscriptionGuard, PlanGuard)
@Roles('dueno')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('today')
  @RequiredPlan('pro')
  async getToday(
    @CurrentUser() user: JwtPayload,
  ): Promise<TodayMetrics> {
    return this.dashboardService.getToday(user.tenant_id);
  }

  @Get('monthly')
  @RequiredPlan('pro')
  async getMonthly(
    @CurrentUser() user: JwtPayload,
  ): Promise<MonthlyMetrics> {
    return this.dashboardService.getMonthly(user.tenant_id);
  }

  @Get('daily-chart')
  @RequiredPlan('pro')
  async getDailyChart(
    @CurrentUser() user: JwtPayload,
    @Query('month') month?: string,
  ): Promise<DailyChartEntry[]> {
    return this.dashboardService.getDailyChart(user.tenant_id, month);
  }

  @Get('critical-stock')
  async getCriticalStock(
    @CurrentUser() user: JwtPayload,
  ): Promise<Product[]> {
    return this.dashboardService.getCriticalStock(user.tenant_id);
  }

  @Get('inventory-value')
  @RequiredPlan('pro')
  async getInventoryValue(
    @CurrentUser() user: JwtPayload,
  ): Promise<InventoryValue> {
    return this.dashboardService.getInventoryValue(user.tenant_id);
  }
}
