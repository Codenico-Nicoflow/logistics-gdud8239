import { Module } from '@nestjs/common';
import { MesakemService } from './mesakem.service';
import { MesakemController } from './mesakem.controller';

@Module({
  providers: [MesakemService],
  controllers: [MesakemController],
  exports: [MesakemService],
})
export class MesakemModule {}
