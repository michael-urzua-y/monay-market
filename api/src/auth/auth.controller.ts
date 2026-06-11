import { Body, Controller, Logger, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginThrottleService } from './login-throttle.service';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly loginThrottle: LoginThrottleService,
  ) {}

  @Post('login')
  async login(@Body() loginDto: LoginDto, @Request() req: any) {
    const throttleKey = this.getThrottleKey(req, loginDto.email);
    await this.loginThrottle.consume(throttleKey);

    try {
      const result = await this.authService.login(loginDto);
      await this.loginThrottle.reset(throttleKey);
      this.logger.log(`Login exitoso: ${loginDto.email} desde ${this.getClientIp(req)}`);
      return result;
    } catch (error) {
      this.logger.warn(
        `Login fallido: ${loginDto.email} desde ${this.getClientIp(req)} — ${error.message || 'credenciales inválidas'}`,
      );
      throw error;
    }
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('refresh')
  async refresh(@Request() req: any) {
    return this.authService.refresh(req.user.user_id);
  }

  private getClientIp(req: any): string {
    const forwardedFor = String(req.headers?.['x-forwarded-for'] || '')
      .split(',')[0]
      .trim();
    return forwardedFor || req.ip || req.socket?.remoteAddress || 'unknown';
  }

  private getThrottleKey(req: any, email: string): string {
    const ip = this.getClientIp(req);
    return `${ip}:${email.trim().toLowerCase()}`;
  }
}
