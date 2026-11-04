import { Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SnapshotsService } from './snapshots.service';
import type { AuthUser } from '../auth/auth.types';

@Controller('snapshots')
@Roles('admin')
export class SnapshotsController {
  constructor(private readonly snapshots: SnapshotsService) {}

  @Get()
  list(@Query('limit') limit?: string) {
    return this.snapshots.list(limit ? Number(limit) : undefined);
  }

  @Post()
  create(@CurrentUser() actor: AuthUser) {
    return this.snapshots.create('manual', actor);
  }

  @Get(':id/download')
  async download(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const { stream, fileName } = await this.snapshots.readFile(id);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    stream.pipe(res);
  }

  @Post(':id/send-to-slack')
  sendToSlack(@Param('id') id: string) {
    return this.snapshots.sendToSlack(id);
  }
}
