import { IsArray, ArrayMinSize, IsUUID } from 'class-validator';

export class BulkDeleteProductsDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Debe seleccionar al menos un producto' })
  @IsUUID(4, { each: true, message: 'Cada ID debe ser un UUID válido' })
  ids: string[];
}
