import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ModuleId } from './module-manifest';
import { ModulesService } from './modules.service';
import { REQUIRE_MODULE_KEY } from './require-module.decorator';

@Injectable()
export class ModulesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly modules: ModulesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<ModuleId | undefined>(REQUIRE_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;
    if (!(await this.modules.isOn(required))) throw new ForbiddenException('החלק הזה כבוי בגדוד שלכם');
    return true;
  }
}
