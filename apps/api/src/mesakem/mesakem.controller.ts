import { Body, Controller, Get, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MesakemService } from './mesakem.service';
import { SaveMesakemDto } from './dto/save-mesakem.dto';
import { FinishDayDto } from './dto/finish-day.dto';
import type { AuthUser } from '../auth/auth.types';

@Controller('mesakem')
@Roles('admin', 'logistics')
export class MesakemController {
  constructor(private readonly mesakem: MesakemService) {}

  @Get('sheet')
  sheet(@Query('date') date: string) {
    return this.mesakem.sheet(date);
  }

  @Get('export')
  async export(@Query('date') date: string, @Res() res: Response): Promise<void> {
    const { buffer, fileName } = await this.mesakem.exportExcel(date);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Cache-Control', 'no-store, private');
    res.send(buffer);
  }

  @Post()
  save(@Body() dto: SaveMesakemDto, @CurrentUser() actor: AuthUser) {
    return this.mesakem.save(dto.sessionDate, dto.lines, actor);
  }

  @Post('finish-day')
  finishDay(@Body() dto: FinishDayDto) {
    return this.mesakem.finishDay(dto.sessionDate);
  }
}
