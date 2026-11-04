import { Module } from '@nestjs/common';
import { CountsService } from './counts.service';
import { CountsController } from './counts.controller';

@Module({
  providers: [CountsService],
  controllers: [CountsController],
  exports: [CountsService],
})
export class CountsModule {}
