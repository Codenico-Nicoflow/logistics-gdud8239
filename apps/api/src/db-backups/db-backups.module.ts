import { Module } from '@nestjs/common';
import { DbBackupsService } from './db-backups.service';
import { DbBackupsController } from './db-backups.controller';

@Module({
  providers: [DbBackupsService],
  controllers: [DbBackupsController],
  exports: [DbBackupsService],
})
export class DbBackupsModule {}
