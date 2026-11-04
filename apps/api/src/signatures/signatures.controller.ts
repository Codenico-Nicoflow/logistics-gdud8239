import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { SignaturesService } from './signatures.service';
import { IssueDto } from './dto/issue.dto';
import { ReturnDto } from './dto/return.dto';
import { QuerySignaturesDto } from './dto/query-signatures.dto';
import type { AuthUser } from '../auth/auth.types';

@Controller('signatures')
export class SignaturesController {
  constructor(private readonly signatures: SignaturesService) {}

  @Get()
  findAll(@Query() query: QuerySignaturesDto) {
    return this.signatures.findAll(query);
  }

  /** ניפוק */
  @Post('issue')
  @Roles('admin', 'logistics')
  issue(@Body() dto: IssueDto, @CurrentUser() actor: AuthUser) {
    return this.signatures.issue(dto, actor);
  }

  /** זיכוי */
  @Post(':id/return')
  @Roles('admin', 'logistics')
  return(
    @Param('id') id: string,
    @Body() dto: ReturnDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.signatures.return(id, dto, actor);
  }

  /** Completes a serial missing from the Excel import. */
  @Post(':id/backfill-serial')
  @Roles('admin', 'logistics')
  backfillSerial(
    @Param('id') id: string,
    @Body() body: { serial: string },
    @CurrentUser() actor: AuthUser,
  ) {
    return this.signatures.backfillSerial(id, body.serial, actor);
  }
}
