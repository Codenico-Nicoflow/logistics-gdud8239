import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { IfsunService } from './ifsun.service';
import { CloseIfsunDto, StoreDto } from './dto/store.dto';
import { QueryIfsunDto } from './dto/query-ifsun.dto';

// Admin + logistics only, reads included: אפסון is the armory's own bookkeeping.
@Controller('ifsun')
@Roles('admin', 'logistics')
export class IfsunController {
  constructor(private readonly ifsun: IfsunService) {}

  @Get()
  findAll(@Query() query: QueryIfsunDto) {
    return this.ifsun.findAll(query);
  }

  @Post()
  store(@Body() dto: StoreDto, @CurrentUser() actor: AuthUser) {
    return this.ifsun.store(dto.signatureId, dto.quantity, dto.notes, actor);
  }

  @Post(':id/collect')
  collect(@Param('id') id: string, @Body() dto: CloseIfsunDto, @CurrentUser() actor: AuthUser) {
    return this.ifsun.collect(id, dto.notes, actor);
  }

  @Post(':id/credit')
  credit(@Param('id') id: string, @Body() dto: CloseIfsunDto, @CurrentUser() actor: AuthUser) {
    return this.ifsun.credit(id, dto.notes, actor);
  }
}
