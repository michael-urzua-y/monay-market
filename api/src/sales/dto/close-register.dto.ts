import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class CloseRegisterDto {
  @Type(() => Number)
  @IsNumber({}, { message: 'El efectivo contado debe ser numérico' })
  @Min(0, { message: 'El efectivo contado no puede ser negativo' })
  counted_efectivo: number;
}
