import { IsOptional, IsEnum, IsDateString } from 'class-validator';
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
}
