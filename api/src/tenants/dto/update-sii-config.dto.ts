import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RutField } from '../../common/rut/rut.decorator';

export class UpdateSiiConfigDto {
  @IsOptional()
  @IsBoolean()
  sii_enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  sii_api_key?: string | null;

  @RutField('El RUT emisor', { optional: true })
  sii_rut_emisor?: string | null;

  @RutField('El RUT autenticador', { optional: true })
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
