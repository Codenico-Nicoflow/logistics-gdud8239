import { Tier } from '../common/throttle-tiers';
import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { IssueFormsService } from './issue-forms.service';
import { CreateIssueFormDto } from './dto/create-issue-form.dto';
import { UpdateIssueFormDto } from './dto/update-issue-form.dto';
import { renderIssueForm } from './issue-form.html';
import { sendPrintPage } from '../common/print-page';
import type { AuthUser } from '../auth/auth.types';
import { BoundedIntPipe, OptionalUuidPipe } from '../common/pipes';

@Controller('issue-forms')
export class IssueFormsController {
  constructor(private readonly forms: IssueFormsService) {}

  // A 1008 carries a soldier's name, מ.א., phone and drawn signature. Reading one was open to any
  // logged-in user, and by id — so it needs the same roles as the חתימות screen it belongs to.
  @Get()
  @Roles('admin', 'logistics', 'viewer')
  findAll(
    @CurrentUser() actor: AuthUser,
    @Query('soldierId', new OptionalUuidPipe()) soldierId?: string,
    @Query('take', new BoundedIntPipe(1, 200, 'take')) take?: number,
    @Query('skip', new BoundedIntPipe(0, 100_000, 'skip')) skip?: number,
  ) {
    return this.forms.findAll({
      ...(soldierId ? { soldierId } : {}),
      ...(take ? { take } : {}),
      ...(skip ? { skip } : {}),
      scope: actor.companyScope,
    });
  }

  @Get(':id')
  @Roles('admin', 'logistics', 'viewer')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) {
    return this.forms.findOne(id, actor.companyScope);
  }

  /**
   * The printable form. Served as HTML rather than a PDF binary so Hebrew
   * lays out correctly without bundling a font and a bidi engine; the
   * browser's own print dialog produces the PDF.
   */
  @Tier('print')
  @Get(':id/print')
  @Roles('admin', 'logistics', 'viewer')
  async print(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const form = await this.forms.findOne(id, actor.companyScope);
    sendPrintPage(res, (nonce) => renderIssueForm(form, nonce));
  }

  @Post()
  @Roles('admin', 'logistics')
  create(@Body() dto: CreateIssueFormDto, @CurrentUser() actor: AuthUser) {
    return this.forms.create(dto, actor);
  }

  @Patch(':id')
  @Roles('admin', 'logistics')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateIssueFormDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.forms.update(id, dto, actor);
  }

  /**
   * A real change to what's on a signed form — different מסד/item/quantity,
   * not just a header fix — returns whatever the new lines no longer cover
   * and signs a brand new 1008. See IssueFormsService#reissue for the WHY.
   */
  @Post(':id/reissue')
  @Roles('admin', 'logistics')
  reissue(
    @Param('id') id: string,
    @Body() dto: CreateIssueFormDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.forms.reissue(id, dto, actor);
  }
}
