import { Body, Controller, Get, Post } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { PermissionsService } from './permissions.service';
import { SetPermissionDto } from './dto/set-permission.dto';

/** הרשאות — admin-only screen that edits the matrix `PermissionsGuard` reads. */
@Controller('permissions')
@Roles('admin')
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
