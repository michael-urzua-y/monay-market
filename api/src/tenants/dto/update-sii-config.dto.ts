import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SiiProvider } from '../../entities/enums';

export class UpdateSiiConfigDto {
  @IsOptional()
  @IsBoolean()
  sii_enabled?: boolean;

  @IsOptional()
  @IsEnum(SiiProvider)
  sii_provider?: SiiProvider | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  sii_api_key?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  sii_rut_emisor?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  sii_rut_autenticador?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sii_codigo_sucursal?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sii_clave_tributaria?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sii_razon_social?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  sii_giro?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sii_certificado_path?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sii_certificado_password?: string | null;

  @IsOptional()
  @IsBoolean()
  sii_sandbox_mode?: boolean;
}
