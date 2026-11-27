import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { PlatformService } from './platform.service';

@Module({ providers: [PlatformService], controllers: [PlatformController] })
export class PlatformModule {}
