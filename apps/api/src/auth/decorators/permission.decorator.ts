import { SetMetadata } from '@nestjs/common';
import type { PermissionLevel, Role } from '@prisma/client';

export const PERMISSION_KEY = 'permission';

export type RequiredPermission = {
  key: string;
  level: Exclude<PermissionLevel, 'NONE'>;
  /** Roles that pass regardless of the matrix — an escape hatch for routes
   *  an existing role must keep using unconditionally (e.g. `logistics`
   *  adding a soldier inline during ניפוק) while a new role also gets the
   *  same access through the editable matrix. */
  alsoAllow?: Role[];
};

/**
 * Restricts a route to roles whose `role_permissions` row for `key` is at
 * least `level`, OR one of `alsoAllow`. `admin` always passes, regardless of
 * the matrix — see `PermissionsGuard`. With no `@RequirePermission()` on a
 * route, any authenticated user may call it, same contract as `@Roles()`.
 */
export const RequirePermission = (
  key: string,
  level: Exclude<PermissionLevel, 'NONE'> = 'WRITE',
  alsoAllow?: Role[],
): MethodDecorator & ClassDecorator => SetMetadata(PERMISSION_KEY, { key, level, alsoAllow });
