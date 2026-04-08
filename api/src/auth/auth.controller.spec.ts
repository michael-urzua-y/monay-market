import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UserRole } from '../entities/enums';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { login: jest.Mock; refresh: jest.Mock };

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      refresh: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('POST /auth/login', () => {
    it('should call authService.login and return the result', async () => {
      const loginDto = { email: 'test@example.com', password: 'password123' };
      const expected = {
        accessToken: 'jwt-token',
        user: { id: 'u1', email: 'test@example.com', role: UserRole.DUENO, tenant_id: 't1' },
      };
      authService.login.mockResolvedValue(expected);

      const result = await controller.login(loginDto);

      expect(authService.login).toHaveBeenCalledWith(loginDto);
      expect(result).toEqual(expected);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should call authService.refresh with user_id from JWT', async () => {
      const req = { user: { user_id: 'u1', role: UserRole.DUENO, tenant_id: 't1' } };
      const expected = { accessToken: 'new-jwt-token' };
      authService.refresh.mockResolvedValue(expected);

      const result = await controller.refresh(req);

      expect(authService.refresh).toHaveBeenCalledWith('u1');
      expect(result).toEqual(expected);
    });
  });
});
