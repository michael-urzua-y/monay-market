import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { User } from '../entities/user.entity';
import { UserRole } from '../entities/enums';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: Record<string, jest.Mock>;
  let jwtService: { sign: jest.Mock };

  const mockUser: Partial<User> = {
    id: 'user-uuid-1',
    email: 'test@example.com',
    password_hash: '',
    role: UserRole.DUENO,
    tenant_id: 'tenant-uuid-1',
    active: true,
  };

  beforeEach(async () => {
    // Hash a known password for testing
    mockUser.password_hash = await bcrypt.hash('correctPassword123', 10);

    userRepository = {
      findOne: jest.fn(),
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('signed-jwt-token'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('should return accessToken and user data on valid credentials', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.login({
        email: 'test@example.com',
        password: 'correctPassword123',
      });

      expect(result.accessToken).toBe('signed-jwt-token');
      expect(result.user).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        tenant_id: mockUser.tenant_id,
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        user_id: mockUser.id,
        role: mockUser.role,
        tenant_id: mockUser.tenant_id,
      });
    });

    it('should throw UnauthorizedException with generic message for non-existent email', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(
        service.login({ email: 'nonexistent@example.com', password: 'anyPassword' }),
      ).rejects.toThrow(new UnauthorizedException('Credenciales inválidas'));
    });

    it('should throw UnauthorizedException with generic message for wrong password', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrongPassword' }),
      ).rejects.toThrow(new UnauthorizedException('Credenciales inválidas'));
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      userRepository.findOne.mockResolvedValue({ ...mockUser, active: false });

      await expect(
        service.login({ email: 'test@example.com', password: 'correctPassword123' }),
      ).rejects.toThrow(new UnauthorizedException('Credenciales inválidas'));
    });

    it('should use the same error message for all failure cases', async () => {
      const expectedMessage = 'Credenciales inválidas';

      // Non-existent email
      userRepository.findOne.mockResolvedValue(null);
      try {
        await service.login({ email: 'no@example.com', password: 'pass' });
      } catch (e) {
        expect(e.message).toBe(expectedMessage);
      }

      // Wrong password
      userRepository.findOne.mockResolvedValue(mockUser);
      try {
        await service.login({ email: 'test@example.com', password: 'wrong' });
      } catch (e) {
        expect(e.message).toBe(expectedMessage);
      }

      // Inactive user
      userRepository.findOne.mockResolvedValue({ ...mockUser, active: false });
      try {
        await service.login({ email: 'test@example.com', password: 'correctPassword123' });
      } catch (e) {
        expect(e.message).toBe(expectedMessage);
      }
    });

    it('should include user_id, role, and tenant_id in JWT payload', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);

      await service.login({ email: 'test@example.com', password: 'correctPassword123' });

      expect(jwtService.sign).toHaveBeenCalledWith({
        user_id: 'user-uuid-1',
        role: UserRole.DUENO,
        tenant_id: 'tenant-uuid-1',
      });
    });
  });

  describe('refresh', () => {
    it('should return a new accessToken for a valid active user', async () => {
      userRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.refresh('user-uuid-1');

      expect(result.accessToken).toBe('signed-jwt-token');
      expect(jwtService.sign).toHaveBeenCalledWith({
        user_id: mockUser.id,
        role: mockUser.role,
        tenant_id: mockUser.tenant_id,
      });
    });

    it('should throw UnauthorizedException if user not found', async () => {
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.refresh('nonexistent-uuid')).rejects.toThrow(
        new UnauthorizedException('Credenciales inválidas'),
      );
    });

    it('should throw UnauthorizedException if user is inactive', async () => {
      userRepository.findOne.mockResolvedValue({ ...mockUser, active: false });

      await expect(service.refresh('user-uuid-1')).rejects.toThrow(
        new UnauthorizedException('Credenciales inválidas'),
      );
    });
  });
});
