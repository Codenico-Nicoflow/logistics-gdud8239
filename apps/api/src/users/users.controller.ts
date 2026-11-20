import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService, type PublicUser } from './users.service';
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
  ): Promise<PublicUser & { generatedPassword?: string }> {
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

  @Post(':id/reset-password')
  resetPassword(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
  ): Promise<{ password: string }> {
    return this.users.resetPassword(id, actor.id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string, @CurrentUser() actor: AuthUser): Promise<void> {
    return this.users.remove(id, actor.id);
  }
}
