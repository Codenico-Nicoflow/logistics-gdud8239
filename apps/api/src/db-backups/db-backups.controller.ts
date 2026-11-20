import { Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DbBackupsService } from './db-backups.service';
import type { AuthUser } from '../auth/auth.types';

@Controller('db-backups')
@Roles('admin')
export class DbBackupsController {
  constructor(private readonly backups: DbBackupsService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.backups.list(limit ? Number(limit) : undefined);
  }

  @Post()
  create(@CurrentUser() actor: AuthUser) {
    return this.backups.create('manual', actor);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const { stream, fileName } = await this.backups.readFile(id);
    res.setHeader('Content-Type', 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    stream.pipe(res);
  }

  @Post(':id/send-to-slack')
  sendToSlack(@Param('id') id: string) {
    return this.backups.sendToSlack(id);
  }
}
