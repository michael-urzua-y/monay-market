import { IsOptional, IsString, IsBoolean, MinLength, MaxLength } from 'class-validator';

export class UpdateUserAdminDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  username?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
