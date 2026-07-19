import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const where: any = {
      id: payload.user_id,
      role: payload.role,
      active: true,
    };

    // superadmin may not have a tenant_id
    if (payload.tenant_id) {
      where.tenant_id = payload.tenant_id;
    }

    const user = await this.usersRepository.findOne({
      where,
      select: ['id', 'tenant_id', 'role', 'active'],
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no autorizado');
    }

    return {
      user_id: user.id,
      role: user.role,
      tenant_id: user.tenant_id,
    };
  }
}
