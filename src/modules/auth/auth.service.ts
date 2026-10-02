import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AdminUser } from '../../database/models';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(AdminUser) private readonly adminUserModel: typeof AdminUser,
    private readonly jwt: JwtService,
  ) {}

  async login(email: string, password: string, ip: string | null) {
    const user = await this.adminUserModel.findOne({
      where: { email: (email || '').trim().toLowerCase() },
    });

    // Same failure for unknown user, wrong password and disabled account, and
    // a hash comparison either way, so timing does not disclose which it was.
    const hash = user?.passwordHash ?? '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
    const ok = await bcrypt.compare(password ?? '', hash);

    if (!user || !ok || !user.isActive) {
      this.logger.warn(`Failed admin login attempt for "${email}" from ${ip ?? 'unknown IP'}`);
      throw new UnauthorizedException('Invalid email or password.');
    }

    await user.update({ lastLoginAt: new Date(), lastLoginIp: ip });

    const payload = {
      sub: user.id,
      id: user.id,
      email: user.email,
      role: user.role,
      fullName: user.fullName,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName },
    };
  }

  async createUser(input: {
    email: string;
    password: string;
    fullName: string;
    role: AdminUser['role'];
  }) {
    const user = await this.adminUserModel.create({
      email: input.email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(input.password, 12),
      fullName: input.fullName,
      role: input.role,
      isActive: true,
    } as any);
    return { id: user.id, email: user.email, role: user.role, fullName: user.fullName };
  }
}
