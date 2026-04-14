import { Controller, Post, Get, Body, UseGuards, Query } from '@nestjs/common';
import { JwtAuthGuard, TenantGuard, RolesGuard } from '../common/guards';
import { CurrentUser } from '../common/decorators';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { MermasService } from './mermas.service';
import { CreateMermaDto } from './dto/create-merma.dto';

@Controller('mermas')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class MermasController {
  constructor(private readonly mermasService: MermasService) {}

  @Post()
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateMermaDto) {
    return this.mermasService.create(user.tenant_id, dto);
  }

  @Get()
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.mermasService.findAll(user.tenant_id);
  }

  @Get('stats')
  async getStats(
    @CurrentUser() user: JwtPayload,
    @Query('month') month: string,
  ) {
    const now = new Date();
    const currentMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return this.mermasService.getStatsByPeriod(user.tenant_id, currentMonth);
  }
}