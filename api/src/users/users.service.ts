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
    const normalizedUsername = this.normalizeUsername(createUserDto.username);
    const existingUser = await this.userRepository
      .createQueryBuilder('user')
      .where('user.tenant_id = :tenantId', { tenantId })
      .andWhere('LOWER(user.username) = :username', { username: normalizedUsername })
      .getOne();

    if (existingUser) {
      throw new ConflictException('Ya existe un cajero con este nombre de usuario');
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(createUserDto.password, saltRounds);

    const user = this.userRepository.create({
      tenant_id: tenantId,
      email: normalizedUsername,
      username: normalizedUsername,
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
    if (user.role !== UserRole.CAJERO) {
      throw new ForbiddenException('Solo se pueden administrar cuentas de cajero');
    }

    user.active = updateUserDto.active;
    const savedUser = await this.userRepository.save(user);
    return this.excludePasswordHash(savedUser);
  }

  async resetPassword(
    tenantId: string,
    userId: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (user.tenant_id !== tenantId) {
      throw new ForbiddenException('No tiene acceso a este recurso');
    }
    if (user.role !== UserRole.CAJERO) {
      throw new ForbiddenException('Solo se pueden resetear cuentas de cajero');
    }

    if (!newPassword || newPassword.length < 8) {
      throw new ConflictException('La contraseña debe tener al menos 8 caracteres');
    }

    if (!/(?=.*[a-z])(?=.*[A-Z0-9])/.test(newPassword)) {
      throw new ConflictException('La contraseña debe contener al menos una minúscula y un número o mayúscula');
    }

    const saltRounds = 10;
    user.password_hash = await bcrypt.hash(newPassword, saltRounds);
    await this.userRepository.save(user);

    return { message: 'Contraseña actualizada exitosamente' };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (!currentPassword) {
      throw new ConflictException('La contraseña actual es requerida');
    }

    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) {
      throw new ConflictException('La contraseña actual es incorrecta');
    }

    if (!newPassword || newPassword.length < 8) {
      throw new ConflictException('La nueva contraseña debe tener al menos 8 caracteres');
    }

    if (!/(?=.*[a-z])(?=.*[A-Z0-9])/.test(newPassword)) {
      throw new ConflictException('La contraseña debe contener al menos una minúscula y un número o mayúscula');
    }

    const saltRounds = 10;
    user.password_hash = await bcrypt.hash(newPassword, saltRounds);
    await this.userRepository.save(user);

    return { message: 'Contraseña cambiada exitosamente' };
  }

  private excludePasswordHash(user: User): Partial<User> {
    const { password_hash, ...result } = user;
    return result;
  }

  private normalizeUsername(username: string): string {
    return username.trim().toLowerCase();
  }
}
