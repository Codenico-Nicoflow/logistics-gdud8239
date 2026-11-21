import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { MovementsModule } from '../movements/movements.module';
import { ExcelExportService } from './excel-export.service';
import { ExcelController } from './excel.controller';

@Module({
  imports: [ReportsModule, MovementsModule],
  providers: [ExcelExportService],
  controllers: [ExcelController],
  exports: [ExcelExportService],
})
export class ExcelModule {}
