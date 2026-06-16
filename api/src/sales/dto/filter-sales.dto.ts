import { IsOptional, IsEnum, IsDateString, IsUUID } from 'class-validator';
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
}
