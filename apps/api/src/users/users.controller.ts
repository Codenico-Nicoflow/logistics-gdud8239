import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService, type PublicUser, type SetupLink } from './users.service';
import { BoundedIntPipe } from '../common/pipes';
import { Tier } from '../common/throttle-tiers';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import type { AuthUser } from '../auth/auth.types';

@Controller('users')
@Roles('admin')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll(): Promise<PublicUser[]> {
    return this.users.findAll();
  }

  @Post()
  create(
    @Body() dto: CreateUserDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<PublicUser & { setup: SetupLink }> {
    return this.users.create(dto, actor.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<PublicUser> {
    return this.users.update(id, dto, actor.id);
  }

  @Post(':id/unlock')
  @HttpCode(204)
  unlock(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser): Promise<void> {
    return this.users.unlock(id, actor.id);
  }

  @Get(':id/security-events')
  securityEvents(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('take', new BoundedIntPipe(1, 200, 'take')) take?: number,
  ) {
    return this.users.securityEvents(id, take);
  }

  /** A fresh one-time setup link: forgotten password, lost device, or a link that expired. */
  @Tier('account')
  @Post(':id/setup-link')
  issueSetupLink(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser): Promise<SetupLink> {
    return this.users.issueSetupLink(id, actor.id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<void> {
    return this.users.remove(id, actor.id);
  }
}
