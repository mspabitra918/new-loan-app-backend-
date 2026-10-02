import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { AdminRole } from '../../database/models';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<AdminRole[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    // Fail closed: a route that declares @Roles() but somehow has no
    // authenticated user is denied, never waved through.
    const user = ctx.switchToHttp().getRequest().user;
    if (!user?.role) {
      throw new ForbiddenException('Authentication is required for this action.');
    }
    if (!required.includes(user.role)) {
      throw new ForbiddenException('Your role does not permit this action.');
    }
    return true;
  }
}
