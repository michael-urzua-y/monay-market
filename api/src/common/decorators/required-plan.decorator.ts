import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PLAN_KEY = 'required_plan';
export const RequiredPlan = (...plans: string[]) =>
  SetMetadata(REQUIRED_PLAN_KEY, plans);
