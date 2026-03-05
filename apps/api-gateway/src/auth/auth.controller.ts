import {
  Controller,
  Post,
  Body,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  NotImplementedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

/**
 * Minimal auth controller for local dev / demo.
 * Production: replace with a dedicated Identity Service.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): { accessToken: string; expiresIn: number } {
    const expected = this.config.get<string>('DEMO_PASSWORD', 'idempo');
    if (dto.password !== expected) {
      throw new UnauthorizedException('Invalid credentials.');
    }
    const token = this.jwtService.sign({ sub: dto.username, username: dto.username });
    return { accessToken: token, expiresIn: 900 };
  }

  /**
   * Phase 0 stub — full implementation arrives in Phase 1 (Identity Service).
   * Returning 501 so clients can detect the missing feature rather than hanging.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
   
  refresh(@Body() _dto: RefreshDto): never {
    throw new NotImplementedException(
      'Token refresh is not yet implemented. Planned for Phase 1 (Identity Service).',
    );
  }
}
