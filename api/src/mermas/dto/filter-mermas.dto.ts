import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Paginación del historial de mermas (mismo criterio que productos y ventas). */
export class FilterMermasDto {
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
