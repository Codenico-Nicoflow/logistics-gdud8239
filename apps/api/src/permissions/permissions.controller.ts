import { Body, Controller, Get, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { PlatformAdminOnly } from '../auth/decorators/platform-admin.decorator';
import { PermissionsService } from './permissions.service';
import { SetPermissionDto } from './dto/set-permission.dto';

/**
 * הרשאות — edits the matrix `PermissionsGuard` reads. The matrix is one table for the whole deployment,
 * not per battalion, so changing it changes every battalion: only the platform operator may.
 */
@Controller('permissions')
@Roles('admin')
@PlatformAdminOnly()
export class PermissionsController {
  constructor(private readonly permissions: PermissionsService) {}

  @Get()
  findMatrix() {
    return this.permissions.findMatrix();
  }

  @Post()
  set(@Body() dto: SetPermissionDto) {
    return this.permissions.set(dto.role, dto.key, dto.level);
  }
}
