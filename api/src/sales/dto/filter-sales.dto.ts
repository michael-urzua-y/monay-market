import { Transform } from 'class-transformer';
import { IsOptional, IsEnum, IsDateString, IsUUID, IsInt, Min, Max } from 'class-validator';
import { BoletaStatus } from '../../entities/enums';

export class FilterSalesDto {
  @IsOptional()
  @IsDateString()
  date_from?: string;

  @IsOptional()
  @IsDateString()
  date_to?: string;

  @IsOptional()
  @IsEnum(BoletaStatus)
  boleta_status?: BoletaStatus;

  @IsOptional()
  @IsUUID('4', { message: 'El cajero seleccionado no es válido' })
  user_id?: string;

  @IsOptional()
  @Transform(({ value }) => value != null ? Number(value) : undefined)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => value != null ? Number(value) : undefined)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
