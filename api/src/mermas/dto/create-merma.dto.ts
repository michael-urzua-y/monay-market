import { IsNotEmpty, IsNumber, IsEnum, IsOptional, IsString, Min } from 'class-validator';
import { MermaCause } from '../../entities/merma.entity';

export class CreateMermaDto {
  @IsNotEmpty()
  @IsString()
  product_id: string;

  @IsNotEmpty()
  @IsNumber()
  @Min(0.001)
  quantity: number;

  @IsNotEmpty()
  @IsEnum(MermaCause)
  cause: MermaCause;

  @IsOptional()
  @IsString()
  note?: string;
}