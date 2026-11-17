import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** Cobro con tarjeta (SumUp Tap to Pay). Un texto vacío borra la clave. */
export class UpdateCardPaymentConfigDto {
  @IsOptional()
  @IsBoolean()
  card_payment_enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  sumup_api_key?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  sumup_affiliate_key?: string | null;
}
