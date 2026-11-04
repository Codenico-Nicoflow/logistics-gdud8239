import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { SoldiersService } from './soldiers.service';
import { CreateSoldierDto } from './dto/create-soldier.dto';
import { UpdateSoldierDto } from './dto/update-soldier.dto';
import { QuerySoldiersDto } from './dto/query-soldiers.dto';

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
  @Roles('admin', 'logistics')
  checkDuplicates(@Body() dto: CreateSoldierDto) {
    return this.soldiers.findPossibleDuplicates(dto);
  }

  @Post()
  @Roles('admin', 'logistics')
  create(@Body() dto: CreateSoldierDto) {
    return this.soldiers.create(dto);
  }

  @Patch(':id')
  @Roles('admin', 'logistics')
  update(@Param('id') id: string, @Body() dto: UpdateSoldierDto) {
    return this.soldiers.update(id, dto);
  }
}
