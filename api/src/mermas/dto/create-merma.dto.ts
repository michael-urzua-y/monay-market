import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { MermaCause } from '../../entities/merma.entity';

export class CreateMermaDto {
  @IsNotEmpty()
  @IsUUID('4')
  product_id: string;

  @IsNotEmpty()
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity: number;

  @IsNotEmpty()
  @IsEnum(MermaCause)
  cause: MermaCause;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
