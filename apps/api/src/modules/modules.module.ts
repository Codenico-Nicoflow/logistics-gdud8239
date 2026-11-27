import { Global, Module } from '@nestjs/common';
import { ModulesController } from './modules.controller';
import { ModulesGuard } from './modules.guard';
import { ModulesService } from './modules.service';

/** Global: the attendance job, the Excel export and the issue flow all ask whether a part is on. */
@Global()
@Module({ providers: [ModulesService, ModulesGuard], controllers: [ModulesController], exports: [ModulesService, ModulesGuard] })
export class ModulesModule {}
