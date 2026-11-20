import { Module } from '@nestjs/common';
import { SignaturesModule } from '../signatures/signatures.module';
import { IssueFormsService } from './issue-forms.service';
import { IssueFormsController } from './issue-forms.controller';

@Module({
  imports: [SignaturesModule],
  controllers: [IssueFormsController],
  providers: [IssueFormsService],
  exports: [IssueFormsService],
})
export class IssueFormsModule {}
