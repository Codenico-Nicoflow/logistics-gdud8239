import { Controller, Get } from '@nestjs/common';
import {
  ReportsService,
  type AllocationRow,
  type MatrixRow,
  type SummaryRow,
} from './reports.service';

/** Read-only computed views. Any authenticated user may read them. */
@Controller('reports')
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
