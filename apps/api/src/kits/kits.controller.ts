import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { KitsService } from './kits.service';
import { CreateKitDto, UpdateKitDto } from './dto/kit.dto';

@Controller('kits')
export class KitsController {
  constructor(private readonly kits: KitsService) {}

  @Get()
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.kits.findAll(includeInactive === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.kits.findOne(id);
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateKitDto) {
    return this.kits.create(dto);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateKitDto) {
    return this.kits.update(id, dto);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.kits.remove(id);
  }
}
