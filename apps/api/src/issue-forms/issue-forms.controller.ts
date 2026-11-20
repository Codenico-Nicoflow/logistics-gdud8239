import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { IssueFormsService } from './issue-forms.service';
import { CreateIssueFormDto } from './dto/create-issue-form.dto';
import { UpdateIssueFormDto } from './dto/update-issue-form.dto';
import { renderIssueForm } from './issue-form.html';
import { sendPrintPage } from '../common/print-page';
import type { AuthUser } from '../auth/auth.types';

@Controller('issue-forms')
export class IssueFormsController {
  constructor(private readonly forms: IssueFormsService) {}

  @Get()
  findAll(
    @Query('soldierId') soldierId?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.forms.findAll({
      ...(soldierId ? { soldierId } : {}),
      ...(take ? { take: Math.min(Number(take) || 50, 200) } : {}),
      ...(skip ? { skip: Number(skip) || 0 } : {}),
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.forms.findOne(id);
  }

  /**
   * The printable form. Served as HTML rather than a PDF binary so Hebrew
   * lays out correctly without bundling a font and a bidi engine; the
   * browser's own print dialog produces the PDF.
   */
  @Get(':id/print')
  async print(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const form = await this.forms.findOne(id);
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
