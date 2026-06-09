import { Body, Controller, Post, Request, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginThrottleService } from './login-throttle.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly loginThrottle: LoginThrottleService,
  ) {}

  @Post('login')
  async login(@Body() loginDto: LoginDto, @Request() req: any) {
    const throttleKey = this.getThrottleKey(req, loginDto.email);
    await this.loginThrottle.consume(throttleKey);
    const result = await this.authService.login(loginDto);
    await this.loginThrottle.reset(throttleKey);
    return result;
  }

  @UseGuards(AuthGuard('jwt'))
  @Post('refresh')
  async refresh(@Request() req: any) {
    return this.authService.refresh(req.user.user_id);
  }

  private getThrottleKey(req: any, email: string): string {
    const forwardedFor = String(req.headers?.['x-forwarded-for'] || '')
      .split(',')[0]
      .trim();
    const ip = forwardedFor || req.ip || req.socket?.remoteAddress || 'unknown';
    return `${ip}:${email.trim().toLowerCase()}`;
  }
}
