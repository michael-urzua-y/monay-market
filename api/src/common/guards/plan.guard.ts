import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from '../../entities/subscription.entity';
import { REQUIRED_PLAN_KEY } from '../decorators/required-plan.decorator';

@Injectable()
export class PlanGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPlans = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PLAN_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no @RequiredPlan() decorator is present, allow access
    if (!requiredPlans || requiredPlans.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();

    // Use subscription from request if SubscriptionGuard already attached it
    let subscription = request.subscription;
    if (!subscription) {
      const user = request.user;
      if (!user?.tenant_id) {
        throw new ForbiddenException('No tiene acceso a este recurso');
      }
      subscription = await this.subscriptionRepository.findOne({
        where: { tenant_id: user.tenant_id },
      });
    }

    if (!subscription || !requiredPlans.includes(subscription.plan)) {
      throw new ForbiddenException({
        error: 'PLAN_RESTRICTION',
        message: 'Esta función no está disponible en su plan actual',
      });
    }

    return true;
  }
}
