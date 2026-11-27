import { Body, Controller, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PlatformAdminOnly } from '../auth/decorators/platform-admin.decorator';
import { SessionCookies } from '../auth/session-cookies';
import type { AuthUser } from '../auth/auth.types';
import { ActAsDto, AdminDto, CreateBattalionDto, RenameBattalionDto } from './dto/platform.dto';
import { PlatformService } from './platform.service';

@PlatformAdminOnly()
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly platform: PlatformService,
    private readonly auth: AuthService,
    private readonly cookies: SessionCookies,
  ) {}

  @Get('battalions')
  list() {
    return this.platform.list();
  }

  @Post('battalions')
  create(@Body() dto: CreateBattalionDto, @CurrentUser() actor: AuthUser) {
    return this.platform.create(dto, actor);
  }

  @Post('battalions/:id/admin')
  addAdmin(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AdminDto, @CurrentUser() actor: AuthUser) {
    return this.platform.addAdmin(id, dto, actor);
  }

  @Patch('battalions/:id')
  rename(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RenameBattalionDto) {
    return this.platform.rename(id, dto.name);
  }

  @Post('act-as')
  @HttpCode(HttpStatus.OK)
  async actAs(
    @Body() dto: ActAsDto,
    @CurrentUser() caller: AuthUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: AuthUser }> {
    const user = await this.platform.actAs(caller, dto.battalionId);
    this.cookies.set(response, await this.auth.issueTokens(user));
    return { user };
  }
}
