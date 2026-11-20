import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CountShift } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CountsService } from './counts.service';
import { SaveCountDto } from './dto/save-count.dto';
import type { AuthUser } from '../auth/auth.types';

@Controller('counts')
export class CountsController {
  constructor(private readonly counts: CountsService) {}

  // Not SHLISHUT/SAMGAD/COMPANY_CMDR: ספירת נשקיה is part of the original
  // admin/logistics/viewer screen set, unrelated to either new role's job.
  @Get('latest')
  @Roles('admin', 'logistics', 'viewer')
  latest() {
    return this.counts.latest();
  }

  @Get('recent')
  @Roles('admin', 'logistics', 'viewer')
  recent() {
    return this.counts.recent();
  }

  @Get('sheet')
  @Roles('admin', 'logistics', 'viewer')
  sheet(@Query('date') date: string, @Query('shift') shift: CountShift) {
    return this.counts.sheet(date, shift);
  }

  @Post()
  @Roles('admin', 'logistics')
  save(@Body() dto: SaveCountDto, @CurrentUser() actor: AuthUser) {
    return this.counts.save(dto, actor);
  }

  @Post(':id/close')
  @Roles('admin', 'logistics')
  close(@Param('id') id: string) {
    return this.counts.close(id);
  }
}
