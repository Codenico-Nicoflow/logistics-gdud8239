import { Controller, Get } from '@nestjs/common';
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
 */
@Controller('reports')
@Roles('admin', 'logistics', 'viewer')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  summary(): Promise<SummaryRow[]> {
    return this.reports.summary();
  }

  @Get('companies')
  companies(): Promise<MatrixRow[]> {
    return this.reports.companyMatrix();
  }

  @Get('allocations')
  allocations(): Promise<AllocationRow[]> {
    return this.reports.allocations();
  }
}
