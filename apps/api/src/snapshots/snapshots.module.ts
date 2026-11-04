import { forwardRef, Module } from '@nestjs/common';
import { ExcelModule } from '../excel/excel.module';
import { SnapshotsService } from './snapshots.service';
import { SnapshotsController } from './snapshots.controller';

@Module({
  imports: [forwardRef(() => ExcelModule)],
  providers: [SnapshotsService],
  controllers: [SnapshotsController],
  exports: [SnapshotsService],
})
export class SnapshotsModule {}
