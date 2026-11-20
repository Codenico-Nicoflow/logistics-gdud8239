import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { CountShift } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CountsService } from './counts.service';
import { SaveCountDto } from './dto/save-count.dto';
import { renderCountSession } from './count-session.html';
import { sendPrintPage } from '../common/print-page';
import type { AuthUser } from '../auth/auth.types';

@Controller('counts')
export class CountsController {
  constructor(private readonly counts: CountsService) {}

  // ספירת נשקיה is restricted to admin/logistics only — this is the signed
  // daily count sheet, not a report viewers should be reading.
  @Get('latest')
  @Roles('admin', 'logistics')
  latest() {
    return this.counts.latest();
  }

  @Get('recent')
  @Roles('admin', 'logistics')
  recent() {
    return this.counts.recent();
  }

  @Get('sheet')
  @Roles('admin', 'logistics')
  sheet(@Query('date') date: string, @Query('shift') shift: CountShift) {
    return this.counts.sheet(date, shift);
  }

  @Post()
  @Roles('admin', 'logistics')
  save(@Body() dto: SaveCountDto, @CurrentUser() actor: AuthUser) {
    return this.counts.save(dto, actor);
  }

  /** Printable sheet — same reasoning as the 1008's print route: HTML, not a PDF binary, so the browser handles Hebrew layout and the print dialog produces the PDF. */
  @Get(':id/print')
  @Roles('admin', 'logistics')
  async print(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const { session, rows } = await this.counts.forPrint(id);
    sendPrintPage(res, (nonce) => renderCountSession({ ...session, rows }, nonce));
  }

  @Post(':id/close')
  @Roles('admin', 'logistics')
  close(@Param('id') id: string) {
    return this.counts.close(id);
  }
}
