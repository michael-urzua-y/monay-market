import { IsBoolean } from 'class-validator';

export class UpdateUserDto {
  @IsBoolean({ message: 'El campo active debe ser un booleano' })
  active: boolean;
}
