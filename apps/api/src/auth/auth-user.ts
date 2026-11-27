import type { User } from '@prisma/client';
import type { AuthUser } from './auth.types';

/** The slice of a user row the rest of the app sees: never the password hash or lockout state. */
export function toAuthUser(user: Pick<User, 'id' | 'username' | 'displayName' | 'role' | 'companyScope' | 'battalionId' | 'isPlatformAdmin'>): AuthUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    companyScope: user.companyScope,
    battalionId: user.battalionId,
    isPlatformAdmin: user.isPlatformAdmin,
  };
}
