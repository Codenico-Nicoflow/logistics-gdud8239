import { Module } from '@nestjs/common';
import { MesakemModule } from '../mesakem/mesakem.module';
import { CountsService } from './counts.service';
import { CountsController } from './counts.controller';

@Module({
  imports: [MesakemModule],
  providers: [CountsService],
  controllers: [CountsController],
  exports: [CountsService],
})
export class CountsModule {}
