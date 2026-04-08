import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
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
  @IsBoolean()
  sii_sandbox_mode?: boolean;
}
