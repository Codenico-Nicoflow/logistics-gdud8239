import { Tier } from '../common/throttle-tiers';
import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { sendPrintPage } from '../common/print-page';
import { renderIfsun } from './ifsun.html';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { IfsunService } from './ifsun.service';
import { CloseIfsunDto, CollectDto, StoreDto } from './dto/store.dto';
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
    return this.ifsun.store(dto, actor);
  }

  /** Printable document — HTML, so the browser's print dialog makes the PDF (same as the 1008 and the count sheet). */
  @Tier('print')
  @Get(':id/print')
  async print(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const record = await this.ifsun.findOne(id);
    sendPrintPage(res, (nonce) => renderIfsun(record, nonce));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.ifsun.findOne(id);
  }

  @Post(':id/collect')
  collect(@Param('id') id: string, @Body() dto: CollectDto, @CurrentUser() actor: AuthUser) {
    return this.ifsun.collect(id, dto, actor);
  }

  @Post(':id/credit')
  credit(@Param('id') id: string, @Body() dto: CloseIfsunDto, @CurrentUser() actor: AuthUser) {
    return this.ifsun.credit(id, dto.notes, actor);
  }
}
