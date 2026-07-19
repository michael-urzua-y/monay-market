import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SuperAdminGuard } from './superadmin.guard';
import { AdminService } from './admin.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('tenants')
  findAllTenants() {
    return this.adminService.findAllTenants();
  }

  @Get('tenants/:id')
  findOneTenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.findOneTenant(id);
  }

  @Post('tenants')
  createTenant(@Body() dto: CreateTenantDto) {
    return this.adminService.createTenant(dto);
  }

  @Patch('tenants/:id')
  updateTenant(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ) {
    return this.adminService.updateTenant(id, dto);
  }

  @Patch('tenants/:id/subscription')
  updateSubscription(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubscriptionDto,
  ) {
    return this.adminService.updateSubscription(id, dto);
  }

  @Patch('tenants/:tenantId/users/:userId')
  updateUser(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateUserAdminDto,
  ) {
    return this.adminService.updateUser(tenantId, userId, dto);
  }

  @Delete('tenants/:id')
  deleteTenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.adminService.deleteTenant(id);
  }

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }
}
