import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  ReportsService,
  type AllocationRow,
  type MatrixRow,
  type SummaryRow,
} from './reports.service';

/**
 * Read-only computed views, open to admin/logistics/viewer — the original
 * three roles, unchanged since before SHLISHUT/SAMGAD/COMPANY_CMDR existed.
 * Those three new roles each have their own dedicated screen and no business
 * reason to read מסכם/פלוגות/הקצאות.
 *
 * `summary` (מסכם) is the exception: it's now an editable daily entry screen,
 * not a pure report, so it's admin/logistics only — same gate as `counts`.
 */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  @Roles('admin', 'logistics')
  summary(@Query('date') date?: string): Promise<SummaryRow[]> {
    return this.reports.summary(date);
  }

  // SAMGAD too: חלוקה לפלוגות (read-only holdings per company) is his view.
  @Get('companies')
  @Roles('admin', 'logistics', 'viewer', 'SAMGAD')
  companies(): Promise<MatrixRow[]> {
    return this.reports.companyMatrix();
  }

  @Get('allocations')
  @Roles('admin', 'logistics', 'viewer')
  allocations(): Promise<AllocationRow[]> {
    return this.reports.allocations();
  }
}
