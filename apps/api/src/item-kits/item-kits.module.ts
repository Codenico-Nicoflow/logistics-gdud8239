import { Module } from '@nestjs/common';
import { ItemKitsController } from './item-kits.controller';
import { ItemKitsService } from './item-kits.service';

@Module({
  controllers: [ItemKitsController],
  providers: [ItemKitsService],
  exports: [ItemKitsService],
})
export class ItemKitsModule {}
