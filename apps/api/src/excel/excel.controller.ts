import { Tier } from '../common/throttle-tiers';
import { Controller, Get, Res } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import type { Response } from 'express';
import { israelToday } from '../common/israel-date';
import { ExcelExportService } from './excel-export.service';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// The workbook holds every signature, movement, אפסון record and allocation: the whole armory.
// It was open to any logged-in user, including company-scoped ones.
@Controller('excel')
@Roles('admin', 'logistics')
export class ExcelController {
  constructor(private readonly exporter: ExcelExportService) {}

  /** Downloads the full workbook, structured like the original file. */
  @Tier('heavy')
  @Get('export')
  async export(@Res() res: Response): Promise<void> {
    const buffer = await this.exporter.toBuffer();
    const stamp = israelToday();
    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="logistics-${stamp}.xlsx"`);
    res.setHeader('Content-Length', String(buffer.byteLength));
    res.end(buffer);
  }
}
