import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { RequirePermission } from '../auth/decorators/permission.decorator';
import { SoldiersService } from './soldiers.service';
import { CreateSoldierDto } from './dto/create-soldier.dto';
import { UpdateSoldierDto } from './dto/update-soldier.dto';
import { QuerySoldiersDto } from './dto/query-soldiers.dto';
import { SetEnlistedDto } from './dto/set-enlisted.dto';

@Controller('soldiers')
export class SoldiersController {
  constructor(private readonly soldiers: SoldiersService) {}

  @Get()
  findAll(@Query() query: QuerySoldiersDto, @CurrentUser() actor: AuthUser) {
    return this.soldiers.findAll(query, actor.companyScope);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.soldiers.findOne(id, actor.companyScope);
  }

  /** Called by the UI before creating, to warn about a likely duplicate. */
  @Post('check-duplicates')
  @RequirePermission('soldiers', 'WRITE', ['logistics'])
  checkDuplicates(@Body() dto: CreateSoldierDto, @CurrentUser() actor: AuthUser) {
    return this.soldiers.findPossibleDuplicates(dto, actor.companyScope);
  }

  @Post()
  @RequirePermission('soldiers', 'WRITE', ['logistics'])
  create(@Body() dto: CreateSoldierDto, @CurrentUser() actor: AuthUser) {
    return this.soldiers.create(dto, actor.companyScope);
  }

  @Patch(':id')
  @RequirePermission('soldiers', 'WRITE', ['logistics'])
  update(@Param('id') id: string, @Body() dto: UpdateSoldierDto, @CurrentUser() actor: AuthUser) {
    return this.soldiers.update(id, dto, actor.companyScope);
  }

  @Patch(':id/enlistment')
  @RequirePermission('soldiers', 'WRITE', ['logistics'])
  setEnlisted(@Param('id') id: string, @Body() dto: SetEnlistedDto, @CurrentUser() actor: AuthUser) {
    return this.soldiers.setEnlisted(id, dto.enlisted, actor.companyScope);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('soldiers', 'WRITE', ['logistics'])
  remove(@Param('id') id: string, @CurrentUser() actor: AuthUser) {
    return this.soldiers.remove(id, actor.companyScope);
  }
}
