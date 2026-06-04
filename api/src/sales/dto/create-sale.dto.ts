import {
  IsArray,
  IsUUID,
  IsInt,
  IsEnum,
  IsOptional,
  Min,
  ValidateNested,
  ArrayMinSize,
  IsNumber,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PaymentMethod } from '../../entities/enums';

export class SaleLineDto {
  @IsUUID()
  product_id: string;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity: number;
}

export class CreateSaleDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  client_sale_id?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SaleLineDto)
  lines: SaleLineDto[];

  @IsEnum(PaymentMethod)
  payment_method: PaymentMethod;

  @IsOptional()
  @IsInt()
  @Min(0)
  amount_received?: number;
}
