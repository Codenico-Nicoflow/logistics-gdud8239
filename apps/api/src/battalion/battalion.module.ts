import { Global, Module } from '@nestjs/common';
import { BattalionController } from './battalion.controller';
import { BattalionService } from './battalion.service';

/** Global: every report that prints the unit's name asks for it. */
@Global()
@Module({ providers: [BattalionService], controllers: [BattalionController], exports: [BattalionService] })
export class BattalionModule {}
