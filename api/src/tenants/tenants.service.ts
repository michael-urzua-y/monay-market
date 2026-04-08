import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantConfig } from '../entities/tenant-config.entity';
import { Subscription } from '../entities/subscription.entity';
import { UpdateSiiConfigDto } from './dto/update-sii-config.dto';
import { UpdatePrinterConfigDto } from './dto/update-printer-config.dto';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(TenantConfig)
    private readonly configRepository: Repository<TenantConfig>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
  ) {}

  async getConfig(tenantId: string): Promise<TenantConfig> {
    const config = await this.configRepository.findOne({
      where: { tenant_id: tenantId },
    });

    if (!config) {
      throw new NotFoundException('Configuración del tenant no encontrada');
    }

    return config;
  }

  async updateSiiConfig(
    tenantId: string,
    dto: UpdateSiiConfigDto,
  ): Promise<TenantConfig> {
    const config = await this.getConfig(tenantId);

    if (dto.sii_enabled !== undefined) config.sii_enabled = dto.sii_enabled;
    if (dto.sii_provider !== undefined) config.sii_provider = dto.sii_provider;
    if (dto.sii_api_key !== undefined) config.sii_api_key = dto.sii_api_key;
    if (dto.sii_rut_emisor !== undefined) config.sii_rut_emisor = dto.sii_rut_emisor;
    if (dto.sii_sandbox_mode !== undefined) config.sii_sandbox_mode = dto.sii_sandbox_mode;

    return this.configRepository.save(config);
  }

  async updatePrinterConfig(
    tenantId: string,
    dto: UpdatePrinterConfigDto,
  ): Promise<TenantConfig> {
    const config = await this.getConfig(tenantId);
    config.printer_enabled = dto.printer_enabled;
    return this.configRepository.save(config);
  }

  async getSubscription(tenantId: string): Promise<Subscription> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { tenant_id: tenantId },
    });

    if (!subscription) {
      throw new NotFoundException('Suscripción no encontrada');
    }

    return subscription;
  }
}
