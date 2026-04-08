import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { User } from '../entities/user.entity';
import { UserRole } from '../entities/enums';

jest.mock('bcrypt');

describe('UsersService', () => {
  let service: UsersService;

  const tenantId = 'tenant-uuid-1';
  const otherTenantId = 'tenant-uuid-2';

  const mockUser: User = {
    id: 'user-uuid-1',
    tenant_id: tenantId,
    email: 'cajero@test.com',
    password_hash: 'hashed-password',
    role: UserRole.CAJERO,
    active: true,
    created_at: new Date('2024-01-01'),
    tenant: null as any,
    sales: [],
  };

  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    jest.clearAllMocks();
  });

  describe('findAllByTenant', () => {
    it('should return users without password_hash', async () => {
      mockRepository.find.mockResolvedValue([mockUser]);

      const result = await service.findAllByTenant(tenantId);

      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { tenant_id: tenantId },
        order: { created_at: 'DESC' },
      });
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('password_hash');
      expect(result[0].email).toBe('cajero@test.com');
    });

    it('should return empty array when no users exist', async () => {
      mockRepository.find.mockResolvedValue([]);

      const result = await service.findAllByTenant(tenantId);

      expect(result).toEqual([]);
    });
  });

  describe('create', () => {
    const createDto = { email: 'nuevo@test.com', password: 'password123' };

    it('should create a cajero user with hashed password', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('bcrypt-hashed');
      const createdUser = {
        ...mockUser,
        email: createDto.email,
        password_hash: 'bcrypt-hashed',
      };
      mockRepository.create.mockReturnValue(createdUser);
      mockRepository.save.mockResolvedValue(createdUser);

      const result = await service.create(tenantId, createDto);

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(mockRepository.create).toHaveBeenCalledWith({
        tenant_id: tenantId,
        email: createDto.email,
        password_hash: 'bcrypt-hashed',
        role: UserRole.CAJERO,
        active: true,
      });
      expect(result).not.toHaveProperty('password_hash');
      expect(result.email).toBe(createDto.email);
    });

    it('should force role to cajero regardless of input', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('bcrypt-hashed');
      const createdUser = { ...mockUser, password_hash: 'bcrypt-hashed' };
      mockRepository.create.mockReturnValue(createdUser);
      mockRepository.save.mockResolvedValue(createdUser);

      await service.create(tenantId, createDto);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ role: UserRole.CAJERO }),
      );
    });

    it('should force tenant_id from authenticated user', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('bcrypt-hashed');
      const createdUser = { ...mockUser, password_hash: 'bcrypt-hashed' };
      mockRepository.create.mockReturnValue(createdUser);
      mockRepository.save.mockResolvedValue(createdUser);

      await service.create(tenantId, createDto);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenant_id: tenantId }),
      );
    });

    it('should throw ConflictException if email already exists in tenant', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('toggleActive', () => {
    it('should toggle user active status', async () => {
      const user = { ...mockUser, active: true };
      mockRepository.findOne.mockResolvedValue(user);
      mockRepository.save.mockResolvedValue({ ...user, active: false });

      const result = await service.toggleActive(tenantId, mockUser.id, {
        active: false,
      });

      expect(result).not.toHaveProperty('password_hash');
      expect(result.active).toBe(false);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(
        service.toggleActive(tenantId, 'non-existent-id', { active: false }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user belongs to different tenant', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockUser,
        tenant_id: otherTenantId,
      });

      await expect(
        service.toggleActive(tenantId, mockUser.id, { active: false }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
