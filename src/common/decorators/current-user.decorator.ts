import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AdminRole } from '../../database/models';

export interface AuthUser {
  id: string;
  email: string;
  role: AdminRole;
  fullName: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest().user,
);
