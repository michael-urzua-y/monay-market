import {
  IsNotEmpty,
  IsString,
  IsInt,
  IsNumber,
  IsOptional,
  IsUUID,
  Min,
  MaxLength,
  IsBoolean,
} from 'class-validator';

export class CreateProductDto {
  @IsNotEmpty({ message: 'El nombre es requerido' })
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @IsInt({ message: 'El precio debe ser un número entero' })
  @Min(1, { message: 'El precio debe ser mayor a 0' })
  price: number;

  @IsNumber({ maxDecimalPlaces: 3 }, { message: 'El stock debe ser un número con hasta 3 decimales' })
  @Min(0, { message: 'El stock debe ser mayor o igual a 0' })
  stock: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  critical_stock?: number;

  @IsOptional()
  @IsUUID('4', { message: 'category_id debe ser un UUID válido' })
  category_id?: string;

  @IsOptional()
  @IsBoolean()
  is_weighed?: boolean;
}
