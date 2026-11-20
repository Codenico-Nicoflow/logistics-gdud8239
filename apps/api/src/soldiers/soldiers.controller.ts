import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
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
  findAll(@Query() query: QuerySoldiersDto) {
    return this.soldiers.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.soldiers.findOne(id);
  }

  /** Called by the UI before creating, to warn about a likely duplicate. */
  @Post('check-duplicates')
  @RequirePermission('soldiers', 'WRITE', ['logistics'])
  checkDuplicates(@Body() dto: CreateSoldierDto) {
    return this.soldiers.findPossibleDuplicates(dto);
  }

  @Post()
  @RequirePermission('soldiers', 'WRITE', ['logistics'])
  create(@Body() dto: CreateSoldierDto) {
    return this.soldiers.create(dto);
  }

  @Patch(':id')
  @RequirePermission('soldiers', 'WRITE', ['logistics'])
  update(@Param('id') id: string, @Body() dto: UpdateSoldierDto) {
    return this.soldiers.update(id, dto);
  }

  @Patch(':id/enlistment')
  @RequirePermission('soldiers', 'WRITE', ['logistics'])
  setEnlisted(@Param('id') id: string, @Body() dto: SetEnlistedDto) {
    return this.soldiers.setEnlisted(id, dto.enlisted);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermission('soldiers', 'WRITE', ['logistics'])
  remove(@Param('id') id: string) {
    return this.soldiers.remove(id);
  }
}
