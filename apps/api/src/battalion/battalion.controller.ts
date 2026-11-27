import { Body, Controller, Delete, Get, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RequirePermission } from '../auth/decorators/permission.decorator';
import { BattalionService } from './battalion.service';

@Controller('battalion')
export class BattalionController {
  constructor(private readonly battalion: BattalionService) {}

  /** Every signed-in role: the rail and every page header carry the battalion's name and logo. */
  @Get()
  info() {
    return this.battalion.info();
  }

  /** Behind the sign-in on purpose: the picture is the battalion's, and the web app fetches it with its token. */
  @Get('logo')
  async logo(@Res() res: Response): Promise<void> {
    const { data, mime } = await this.battalion.logo();
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // The version in the query string changes with the picture, so a cached copy is never stale.
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.end(Buffer.from(data));
  }

  /** Admin-only: `battalion` is not in the editable matrix, so only the always-passing admin gets through. */
  @Put('logo')
  @RequirePermission('battalion', 'WRITE')
  setLogo(@Body() body: unknown) {
    return this.battalion.setLogo(body);
  }

  @Delete('logo')
  @RequirePermission('battalion', 'WRITE')
  clearLogo() {
    return this.battalion.clearLogo();
  }
}
