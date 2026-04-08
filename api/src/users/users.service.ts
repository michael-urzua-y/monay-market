import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../entities/user.entity';
import { UserRole } from '../entities/enums';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findAllByTenant(tenantId: string): Promise<Partial<User>[]> {
    const users = await this.userRepository.find({
      where: { tenant_id: tenantId },
      order: { created_at: 'DESC' },
    });

    return users.map((user) => this.excludePasswordHash(user));
  }

  async create(
    tenantId: string,
    createUserDto: CreateUserDto,
  ): Promise<Partial<User>> {
    const existingUser = await this.userRepository.findOne({
      where: { email: createUserDto.email, tenant_id: tenantId },
    });

    if (existingUser) {
      throw new ConflictException('Ya existe un usuario con este email en el tenant');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(createUserDto.password, saltRounds);

    const user = this.userRepository.create({
      tenant_id: tenantId,
      email: createUserDto.email,
      password_hash: passwordHash,
      role: UserRole.CAJERO,
      active: true,
    });

    const savedUser = await this.userRepository.save(user);
    return this.excludePasswordHash(savedUser);
  }

  async toggleActive(
    tenantId: string,
    userId: string,
    updateUserDto: UpdateUserDto,
  ): Promise<Partial<User>> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (user.tenant_id !== tenantId) {
      throw new ForbiddenException('No tiene acceso a este recurso');
    }

    user.active = updateUserDto.active;
    const savedUser = await this.userRepository.save(user);
    return this.excludePasswordHash(savedUser);
  }

  private excludePasswordHash(user: User): Partial<User> {
    const { password_hash, ...result } = user;
    return result;
  }
}
