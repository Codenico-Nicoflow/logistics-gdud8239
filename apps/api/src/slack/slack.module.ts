import { Global, Module } from '@nestjs/common';
import { SlackConfigService } from './slack-config.service';
import { SlackController } from './slack.controller';

/** Global: snapshots, מסכם and ימי יציאה all ask which channel this battalion posts to. */
@Global()
@Module({ providers: [SlackConfigService], controllers: [SlackController], exports: [SlackConfigService] })
export class SlackModule {}
