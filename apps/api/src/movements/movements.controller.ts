import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { israelToday } from '../common/israel-date';
import { Roles } from '../auth/decorators/roles.decorator';
import { MovementsService, type MovementRow } from './movements.service';
import { QueryMovementsDto } from './dto/query-movements.dto';
import type { Paginated } from '../common/pagination.dto';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * `דוח תנועות` — read-only for admin/logistics/viewer, the original three
 * roles. SHLISHUT/SAMGAD/COMPANY_CMDR each have their own dedicated screen
 * and no reason to read the movement log.
 */
@Controller('movements')
@Roles('admin', 'logistics', 'viewer')
export class MovementsController {
  constructor(private readonly movements: MovementsService) {}

  @Get()
  findAll(@Query() query: QueryMovementsDto): Promise<Paginated<MovementRow>> {
    return this.movements.findAll(query);
  }

  /** דוח תנועות יומי as an xlsx download, honoring the same filters the screen is showing. */
  @Get('export/daily')
  @Roles('admin', 'logistics')
  async exportDaily(@Query() query: QueryMovementsDto, @Res() res: Response): Promise<void> {
    const buffer = await this.movements.exportDaily(query);
    const stamp = israelToday();
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="daily-movements-${stamp}.xlsx"`);
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.end(buffer);
  }
}
