import { Tier } from '../common/throttle-tiers';
import { BoundedIntPipe } from '../common/pipes';
import { Controller, Delete, Get, Param, Post, Query, Res } from '@nestjs/common';
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
  list(@Query('limit', new BoundedIntPipe(1, 200, 'limit')) limit?: number) {
    return this.snapshots.list(limit);
  }

  @Tier('heavyCreate')
  @Post()
  create(@CurrentUser() actor: AuthUser) {
    return this.snapshots.create('manual', actor);
  }

  @Tier('heavy')
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

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.snapshots.remove(id);
  }

  @Tier('heavy')
  @Post(':id/send-to-slack')
  sendToSlack(@Param('id') id: string) {
    return this.snapshots.sendToSlack(id);
  }
}
