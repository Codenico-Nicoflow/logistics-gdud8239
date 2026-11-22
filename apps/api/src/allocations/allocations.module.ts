import { Module } from '@nestjs/common';
import { AllocationsService } from './allocations.service';
import { ItemKitsModule } from '../item-kits/item-kits.module';
import { AllocationsController } from './allocations.controller';

@Module({
  imports: [ItemKitsModule],
  controllers: [AllocationsController],
  providers: [AllocationsService],
  exports: [AllocationsService],
})
export class AllocationsModule {}
