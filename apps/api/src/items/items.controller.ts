import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { InstanceStatus } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { SetInstanceStatusDto } from './dto/set-instance-status.dto';
import { CreateInstanceDto } from './dto/create-instance.dto';

@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.items.findAll(includeInactive === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.items.findOne(id);
  }

  @Get(':id/available')
  available(@Param('id') id: string, @Query('soldierId') soldierId?: string) {
    return this.items.availableInstances(id, soldierId);
  }

  @Post()
  @Roles('admin')
  create(@Body() dto: CreateItemDto) {
    return this.items.create(dto);
  }

  @Patch(':id')
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateItemDto) {
    return this.items.update(id, dto);
  }

  /** What blocks deletion, so the UI can explain before asking to confirm. */
  @Get(':id/deletion-check')
  @Roles('admin')
  deletionCheck(@Param('id') id: string) {
    return this.items.deletionCheck(id);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.items.remove(id);
  }

  @Post(':id/instances')
  @Roles('admin', 'logistics')
  addInstance(@Param('id') id: string, @Body() dto: CreateInstanceDto) {
    return this.items.addInstance(id, dto);
  }

  @Patch('instances/:instanceId/status')
  @Roles('admin', 'logistics')
  setInstanceStatus(
    @Param('instanceId', ParseUUIDPipe) instanceId: string,
    @Body() body: SetInstanceStatusDto,
  ) {
    return this.items.setInstanceStatus(instanceId, body.status, body.notes);
  }

  @Delete('instances/:instanceId')
  @Roles('admin')
  removeInstance(@Param('instanceId') instanceId: string) {
    return this.items.removeInstance(instanceId);
  }
}
