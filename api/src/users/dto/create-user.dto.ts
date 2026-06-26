import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @IsString({ message: 'El nombre de usuario es requerido' })
  @MinLength(3, { message: 'El nombre de usuario debe tener al menos 3 caracteres' })
  @MaxLength(50, { message: 'El nombre de usuario no puede superar los 50 caracteres' })
  @Matches(/^[a-z0-9._-]+$/i, {
    message: 'El nombre de usuario solo puede contener letras, números, puntos, guiones y guion bajo',
  })
  username: string;

  @IsString({ message: 'La contraseña es requerida' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @Matches(/(?=.*[a-z])(?=.*[A-Z0-9])/, {
    message: 'La contraseña debe contener al menos una minúscula y un número o mayúscula',
  })
  password: string;
}
