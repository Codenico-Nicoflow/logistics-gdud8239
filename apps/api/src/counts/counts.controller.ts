import { Tier } from '../common/throttle-tiers';
import { Body, Controller, Delete, Get, Param, Post, Query, Res, ParseEnumPipe } from '@nestjs/common';
import { CountShift } from '@prisma/client';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CountsService } from './counts.service';
import { SaveCountDto } from './dto/save-count.dto';
import { DeleteCountDto } from './dto/delete-count.dto';
import { ReopenCountDto } from './dto/reopen-count.dto';
import { renderCountSession } from './count-session.html';
import { sendPrintPage } from '../common/print-page';
import { IsoDatePipe } from '../common/pipes';
import type { AuthUser } from '../auth/auth.types';

@Controller('counts')
export class CountsController {
  constructor(private readonly counts: CountsService) {}

  // ספירת נשקיה is restricted to admin/logistics only — this is the signed
  // daily count sheet, not a report viewers should be reading.
  @Get('recent')
  @Roles('admin', 'logistics')
  recent() {
    return this.counts.recent();
  }

  @Get('sheet')
  @Roles('admin', 'logistics')
  sheet(
    @Query('date', new IsoDatePipe()) date: string,
    @Query('shift', new ParseEnumPipe(CountShift)) shift: CountShift,
  ) {
    return this.counts.sheet(date, shift);
  }

  @Post()
  @Roles('admin', 'logistics')
  save(@Body() dto: SaveCountDto, @CurrentUser() actor: AuthUser) {
    return this.counts.save(dto, actor);
  }

  /** Printable sheet — same reasoning as the 1008's print route: HTML, not a PDF binary, so the browser handles Hebrew layout and the print dialog produces the PDF. */
  @Tier('print')
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

  /** Admin only: cancels a closed count (a mistake), clears its signatures and logs why. */
  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string, @Body() dto: DeleteCountDto, @CurrentUser() actor: AuthUser) {
    return this.counts.remove(id, dto.reason, actor);
  }

  @Post(':id/reopen')
  @Roles('admin')
  reopen(@Param('id') id: string, @Body() dto: ReopenCountDto, @CurrentUser() actor: AuthUser) {
    return this.counts.reopen(id, dto.reason, actor);
  }
}
