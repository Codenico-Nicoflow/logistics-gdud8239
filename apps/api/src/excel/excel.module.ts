import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { MovementsModule } from '../movements/movements.module';
import { MesakemModule } from '../mesakem/mesakem.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { AllocationsModule } from '../allocations/allocations.module';
import { ExcelExportService } from './excel-export.service';
import { ExcelController } from './excel.controller';

@Module({
  imports: [ReportsModule, MovementsModule, MesakemModule, AllocationsModule, AttendanceModule],
  providers: [ExcelExportService],
  controllers: [ExcelController],
  exports: [ExcelExportService],
})
export class ExcelModule {}
