import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { SetModuleDto } from './dto/set-module.dto';
import { ModulesService } from './modules.service';

@Controller('modules')
export class ModulesController {
  constructor(private readonly modules: ModulesService) {}

  /** Every signed-in role: the rail and the screens hide what is off. */
  @Get()
  state(@CurrentUser() user: AuthUser) {
    return this.modules.overview(user.id);
  }

  /** The service itself refuses anyone who is not a super admin. */
  @Put(':id')
  set(@Param('id') id: string, @Body() dto: SetModuleDto, @CurrentUser() user: AuthUser) {
    return this.modules.set(id, dto.enabled, user.id);
  }
}
