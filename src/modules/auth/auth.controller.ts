import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { IsEmail, IsIn, IsString, MinLength } from 'class-validator';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { Public, Roles } from '../../common/decorators/roles.decorator';
import { extractIp } from '../../common/decorators/client-meta.decorator';

class LoginDto {
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
}

class CreateUserDto {
  @IsEmail() email: string;
  @IsString() @MinLength(12) password: string;
  @IsString() fullName: string;
  @IsIn(['agent', 'closer', 'verification', 'underwriter', 'compliance', 'admin'])
  role: 'agent' | 'closer' | 'verification' | 'underwriter' | 'compliance' | 'admin';
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto.email, dto.password, extractIp(req));
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  @Roles('admin')
  @Post('users')
  createUser(@Body() dto: CreateUserDto) {
    return this.auth.createUser(dto);
  }
}
