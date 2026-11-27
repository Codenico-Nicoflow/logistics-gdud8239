import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { PlatformAdminOnly } from '../auth/decorators/platform-admin.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { SetChannelDto } from './dto/set-channel.dto';
import { SlackConfigService } from './slack-config.service';

@Controller('slack')
export class SlackController {
  constructor(private readonly slack: SlackConfigService) {}

  /** Every signed-in role: screens hide the send buttons of what is not configured. Channel ids only reach the platform admin. */
  @Get()
  overview(@CurrentUser() user: AuthUser) {
    return this.slack.overview(user);
  }

  @PlatformAdminOnly()
  @Put(':kind')
  set(@Param('kind') kind: string, @Body() dto: SetChannelDto, @CurrentUser() user: AuthUser) {
    return this.slack.set(kind, dto.channelId?.trim() ? dto.channelId.trim() : null, user);
  }
}
