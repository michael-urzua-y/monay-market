import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import { LoginThrottleService } from './login-throttle.service';
import { LoginRateLimit } from '../entities/login-rate-limit.entity';

describe('LoginThrottleService', () => {
  let service: LoginThrottleService;
  let repository: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };

  beforeEach(async () => {
    repository = {
      findOne: jest.fn(),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => value),
      delete: jest.fn(async () => ({ affected: 1 })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginThrottleService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'LOGIN_RATE_LIMIT_WINDOW_MS') return '60000';
              if (key === 'LOGIN_RATE_LIMIT_MAX_ATTEMPTS') return '2';
              if (key === 'LOGIN_RATE_LIMIT_BLOCK_MS') return '300000';
              return undefined;
            }),
          },
        },
        {
          provide: getRepositoryToken(LoginRateLimit),
          useValue: repository,
        },
      ],
    }).compile();

    service = module.get<LoginThrottleService>(LoginThrottleService);
  });

  it('creates a new bucket on first attempt', async () => {
    repository.findOne.mockResolvedValue(null);

    await service.consume('127.0.0.1:test@example.com');

    expect(repository.create).toHaveBeenCalled();
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        key: '127.0.0.1:test@example.com',
        attempts: 1,
      }),
    );
  });

  it('blocks when attempts exceed the configured limit', async () => {
    repository.findOne.mockResolvedValue({
      key: '127.0.0.1:test@example.com',
      attempts: 2,
      reset_at: new Date(Date.now() + 60_000),
      blocked_until: null,
    });

    await expect(
      service.consume('127.0.0.1:test@example.com'),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        attempts: 3,
      }),
    );
  });

  it('deletes the bucket after a successful login', async () => {
    await service.reset('127.0.0.1:test@example.com');
    expect(repository.delete).toHaveBeenCalledWith({
      key: '127.0.0.1:test@example.com',
    });
  });
});
