import { IsString, MinLength, MaxLength, IsNotEmpty } from 'class-validator';
import { RutField } from '../../common/rut/rut.decorator';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @RutField('El RUT del negocio')
  rut: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(50)
  owner_username: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  owner_password: string;
}
