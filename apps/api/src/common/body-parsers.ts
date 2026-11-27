import type { NestExpressApplication } from '@nestjs/platform-express';

/**
 * Shared by main.ts and the e2e harness so a test exercises the limits production runs with.
 *
 * JSON is explicit rather than Express's 100 kb default, which is below the 400 kb a drawn signature is
 * allowed to be, and nothing bigger than this gets in. The battalion logo arrives as the raw image; its
 * cap sits a little above the service's own limit so an oversized file still reaches it and gets a
 * readable message instead of a bare 413.
 */
export function useBodyParsers(app: NestExpressApplication): void {
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('raw', { type: ['image/png', 'image/jpeg'], limit: '600kb' });
}
