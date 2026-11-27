import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { runInRequest } from './tenant-context';

/** Opens the tenant scope every request runs in. The battalion is bound later, by whatever authenticates it. */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(_request: Request, _response: Response, next: NextFunction): void {
    runInRequest(() => next());
  }
}
