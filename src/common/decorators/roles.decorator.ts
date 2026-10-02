import { SetMetadata } from '@nestjs/common';
import type { AdminRole } from '../../database/models';

export const ROLES_KEY = 'roles';

/** Restricts a route to the listed admin roles. */
export const Roles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);

export const PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(PUBLIC_KEY, true);
