import { Module } from '@nestjs/common';
import { IssueFormsService } from './issue-forms.service';
import { IssueFormsController } from './issue-forms.controller';

@Module({
  controllers: [IssueFormsController],
  providers: [IssueFormsService],
  exports: [IssueFormsService],
})
export class IssueFormsModule {}
