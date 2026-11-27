import { SetMetadata } from '@nestjs/common';

export const PLATFORM_ADMIN_KEY = 'platformAdmin';

/**
 * Restricts a route to the platform operator. Use it on anything that spans battalions or is not
 * partitioned by one: the full-database backups, the permission matrix. A battalion's own admin, even a
 * battalion super-admin, is refused.
 */
export const PlatformAdminOnly = (): MethodDecorator & ClassDecorator => SetMetadata(PLATFORM_ADMIN_KEY, true);
