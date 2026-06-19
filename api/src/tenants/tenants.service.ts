import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { extname, isAbsolute, normalize } from 'path';
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

  async getConfig(tenantId: string): Promise<Partial<TenantConfig>> {
    const config = await this.findConfigOrFail(tenantId);
    return this.sanitizeConfig(config);
  }

  private async findConfigOrFail(tenantId: string): Promise<TenantConfig> {
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
  ): Promise<Partial<TenantConfig>> {
    const config = await this.findConfigOrFail(tenantId);

    if (dto.sii_enabled !== undefined) config.sii_enabled = dto.sii_enabled;
    if (dto.sii_provider !== undefined) config.sii_provider = dto.sii_provider;
    if (dto.sii_api_key !== undefined) config.sii_api_key = this.normalizeOptionalString(dto.sii_api_key);
    if (dto.sii_rut_emisor !== undefined) config.sii_rut_emisor = this.normalizeOptionalString(dto.sii_rut_emisor);
    if (dto.sii_rut_autenticador !== undefined) config.sii_rut_autenticador = this.normalizeOptionalString(dto.sii_rut_autenticador);
    if (dto.sii_codigo_sucursal !== undefined) config.sii_codigo_sucursal = dto.sii_codigo_sucursal;
    if (dto.sii_clave_tributaria !== undefined) config.sii_clave_tributaria = this.normalizeOptionalString(dto.sii_clave_tributaria);
    if (dto.sii_razon_social !== undefined) config.sii_razon_social = this.normalizeOptionalString(dto.sii_razon_social);
    if (dto.sii_giro !== undefined) config.sii_giro = this.normalizeOptionalString(dto.sii_giro);
    if (dto.sii_certificado_path !== undefined) config.sii_certificado_path = this.normalizeCertificatePath(dto.sii_certificado_path);
    if (dto.sii_certificado_password !== undefined) config.sii_certificado_password = this.normalizeOptionalString(dto.sii_certificado_password);
    if (dto.sii_sandbox_mode !== undefined) config.sii_sandbox_mode = dto.sii_sandbox_mode;

    const savedConfig = await this.configRepository.save(config);
    return this.sanitizeConfig(savedConfig);
  }

  async updatePrinterConfig(
    tenantId: string,
    dto: UpdatePrinterConfigDto,
  ): Promise<Partial<TenantConfig>> {
    const config = await this.findConfigOrFail(tenantId);
    config.printer_enabled = dto.printer_enabled;
    const savedConfig = await this.configRepository.save(config);
    return this.sanitizeConfig(savedConfig);
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

  private sanitizeConfig(config: TenantConfig): Partial<TenantConfig> {
    return {
      ...config,
      sii_api_key: config.sii_api_key ? 'configured' : null,
      sii_clave_tributaria: config.sii_clave_tributaria ? 'configured' : null,
      sii_certificado_path: config.sii_certificado_path ? 'configured' : null,
      sii_certificado_password: null,
    };
  }

  private normalizeOptionalString(value: string | null | undefined): string | null {
    if (value == null) return null;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  private normalizeCertificatePath(value: string | null | undefined): string | null {
    const normalized = this.normalizeOptionalString(value);
    if (!normalized) {
      return null;
    }

    if (normalized.includes('\0')) {
      throw new BadRequestException('Ruta de certificado invalida');
    }

    const safePath = normalize(normalized);
    if (!isAbsolute(safePath)) {
      throw new BadRequestException('La ruta del certificado debe ser absoluta');
    }

    const extension = extname(safePath).toLowerCase();
    if (!['.pfx', '.p12'].includes(extension)) {
      throw new BadRequestException('El certificado debe ser .pfx o .p12');
    }

    return safePath;
  }
}
