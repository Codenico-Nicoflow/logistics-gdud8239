import { SetMetadata } from '@nestjs/common';
import type { ModuleId } from './module-manifest';

export const REQUIRE_MODULE_KEY = 'requireModule';

/** Refuses the route (or every route of the controller) while the battalion has that module switched off. */
export const RequireModule = (id: ModuleId): MethodDecorator & ClassDecorator => SetMetadata(REQUIRE_MODULE_KEY, id);
