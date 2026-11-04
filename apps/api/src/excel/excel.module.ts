import { forwardRef, Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { MovementsModule } from '../movements/movements.module';
import { SnapshotsModule } from '../snapshots/snapshots.module';
import { ExcelExportService } from './excel-export.service';
import { ExcelImportService } from './excel-import.service';
import { ExcelController } from './excel.controller';

@Module({
  // Snapshots need the exporter and the import endpoint needs snapshots, so the
  // two modules reference each other.
  imports: [ReportsModule, MovementsModule, forwardRef(() => SnapshotsModule)],
  providers: [ExcelExportService, ExcelImportService],
  controllers: [ExcelController],
  exports: [ExcelExportService, ExcelImportService],
})
export class ExcelModule {}
