import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoginRateLimit } from '../entities/login-rate-limit.entity';

@Injectable()
export class LoginThrottleService {
  private readonly windowMs: number;
  private readonly maxAttempts: number;
  private readonly blockMs: number;

  constructor(
    configService: ConfigService,
    @InjectRepository(LoginRateLimit)
    private readonly loginRateLimitRepository: Repository<LoginRateLimit>,
  ) {
    this.windowMs = this.getNumber(configService, 'LOGIN_RATE_LIMIT_WINDOW_MS', 60_000);
    this.maxAttempts = this.getNumber(configService, 'LOGIN_RATE_LIMIT_MAX_ATTEMPTS', 10);
    this.blockMs = this.getNumber(configService, 'LOGIN_RATE_LIMIT_BLOCK_MS', 300_000);
  }

  async consume(key: string): Promise<void> {
    const now = new Date();
    const current = await this.loginRateLimitRepository.findOne({
      where: { key },
    });

    if (current?.blocked_until && current.blocked_until > now) {
      throw this.createTooManyRequestsError();
    }

    const bucket = current && current.reset_at > now
      ? current
      : this.loginRateLimitRepository.create({
          key,
          attempts: 0,
          reset_at: new Date(now.getTime() + this.windowMs),
          blocked_until: null,
        });

    bucket.attempts += 1;

    if (bucket.attempts > this.maxAttempts) {
      bucket.blocked_until = new Date(now.getTime() + this.blockMs);
      bucket.reset_at = bucket.blocked_until;
      await this.loginRateLimitRepository.save(bucket);
      throw this.createTooManyRequestsError();
    }

    await this.loginRateLimitRepository.save(bucket);
  }

  async reset(key: string): Promise<void> {
    await this.loginRateLimitRepository.delete({ key });
  }

  private getNumber(configService: ConfigService, key: string, fallback: number): number {
    const value = Number(configService.get<string>(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private createTooManyRequestsError(): HttpException {
    return new HttpException(
      'Demasiados intentos. Intente nuevamente en unos minutos.',
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
