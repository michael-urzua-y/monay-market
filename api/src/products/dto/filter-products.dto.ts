import { IsOptional, IsString, IsUUID } from 'class-validator';

export class FilterProductsDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsUUID('4')
  category_id?: string;

  @IsOptional()
  @IsString()
  barcode?: string;
}
