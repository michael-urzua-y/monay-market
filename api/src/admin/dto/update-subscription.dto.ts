import { IsOptional, IsEnum, IsDateString } from 'class-validator';
import { SubscriptionPlan, SubscriptionStatus } from '../../entities/enums';

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsEnum(SubscriptionPlan)
  plan?: SubscriptionPlan;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  status?: SubscriptionStatus;

  @IsOptional()
  @IsDateString()
  end_date?: string;
}
