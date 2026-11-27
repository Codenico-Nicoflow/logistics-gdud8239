import { Tier } from '../common/throttle-tiers';
import { BoundedIntPipe } from '../common/pipes';
import { Controller, Delete, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlatformAdminOnly } from '../auth/decorators/platform-admin.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DbBackupsService } from './db-backups.service';
import type { AuthUser } from '../auth/auth.types';

/** A full dump holds every battalion's data, so only the platform operator may list, take or download one. */
@Controller('db-backups')
@Roles('admin')
@PlatformAdminOnly()
export class DbBackupsController {
  constructor(private readonly backups: DbBackupsService) {}

  @Get()
  list(@Query('limit', new BoundedIntPipe(1, 200, 'limit')) limit?: number) {
    return this.backups.list(limit);
  }

  @Tier('heavyCreate')
  @Post()
  create(@CurrentUser() actor: AuthUser) {
    return this.backups.create('manual', actor);
  }

  @Tier('heavy')
  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const { stream, fileName } = await this.backups.readFile(id);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    stream.pipe(res);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.backups.remove(id);
  }

  @Tier('heavy')
  @Post(':id/send-to-slack')
  sendToSlack(@Param('id') id: string) {
    return this.backups.sendToSlack(id);
  }
}
