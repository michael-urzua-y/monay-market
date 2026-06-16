import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-z0-9._-]+$/i, {
    message: 'El nombre de usuario solo puede contener letras, números, puntos, guiones y guion bajo',
  })
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
