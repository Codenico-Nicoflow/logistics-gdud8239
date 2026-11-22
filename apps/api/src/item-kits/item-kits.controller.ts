import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { ItemKitsService } from './item-kits.service';
import { SaveKitDto } from './dto/save-kit.dto';

/** ערכות — what rides along when an item is issued. Admin only: it decides what every future 1008 pre-fills. */
@Controller('item-kits')
@Roles('admin')
export class ItemKitsController {
  constructor(private readonly kits: ItemKitsService) {}

  @Get()
  list() {
    return this.kits.list();
  }

  @Get(':baseItemId')
  get(@Param('baseItemId', ParseUUIDPipe) baseItemId: string) {
    return this.kits.get(baseItemId);
  }

  @Get(':baseItemId/history')
  history(@Param('baseItemId', ParseUUIDPipe) baseItemId: string) {
    return this.kits.history(baseItemId);
  }

  @Put(':baseItemId')
  save(
    @Param('baseItemId', ParseUUIDPipe) baseItemId: string,
    @Body() dto: SaveKitDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.kits.save(baseItemId, dto, actor);
  }
}
