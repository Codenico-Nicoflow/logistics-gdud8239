import { Module } from '@nestjs/common';
import { ExcelModule } from '../excel/excel.module';
import { SnapshotsService } from './snapshots.service';
import { SnapshotsController } from './snapshots.controller';

@Module({
  imports: [ExcelModule],
  providers: [SnapshotsService],
  controllers: [SnapshotsController],
  exports: [SnapshotsService],
})
export class SnapshotsModule {}
