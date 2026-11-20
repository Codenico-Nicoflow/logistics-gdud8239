import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/decorators/public.decorator';

/**
 * `GET /` — outside the `/api` prefix, unauthenticated. Exists only so a
 * manual visit or an infra health check hitting bare root gets a 200 instead
 * of a 404; the real API lives entirely under `/api`.
 */
@Controller()
export class AppController {
  @Public()
  @Get()
  root() {
    return { service: 'logistics-api', status: 'ok' };
  }
}
