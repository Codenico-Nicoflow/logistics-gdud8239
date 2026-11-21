import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceSlackService } from './attendance-slack.service';
import { SlackFileSender } from '../common/slack-file-sender';

@Module({
  providers: [AttendanceService, AttendanceSlackService, SlackFileSender],
  controllers: [AttendanceController],
  exports: [AttendanceService],
})
export class AttendanceModule {}
