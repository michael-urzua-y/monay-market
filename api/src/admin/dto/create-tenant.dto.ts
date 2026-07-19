import { IsString, MinLength, MaxLength, IsNotEmpty } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
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
