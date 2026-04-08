import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from '../../entities/subscription.entity';
import { SubscriptionStatus } from '../../entities/enums';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    const tenantId = user?.tenant_id;
    if (!tenantId) {
      throw new ForbiddenException('No tiene acceso a este recurso');
    }

    const subscription = await this.subscriptionRepository.findOne({
      where: { tenant_id: tenantId },
    });

    if (subscription?.status !== SubscriptionStatus.ACTIVA) {
      throw new ForbiddenException({
        error: 'SUBSCRIPTION_EXPIRED',
        message: 'Su suscripción ha expirado',
      });
    }

    // Check if end_date has passed
    const now = new Date();
    const endDate = new Date(subscription.end_date);
    if (endDate < now) {
      throw new ForbiddenException({
        error: 'SUBSCRIPTION_EXPIRED',
        message: 'Su suscripción ha expirado',
      });
    }

    // Attach subscription to request for downstream use
    request.subscription = subscription;

    return true;
  }
}
