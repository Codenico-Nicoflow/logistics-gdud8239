import { ValidationPipe } from '@nestjs/common';

/**
 * The one validation setup, shared by `main.ts` and the e2e suites so a test exercises exactly what
 * production runs.
 *
 * `enableImplicitConversion` is deliberately NOT on: it coerces by the declared TypeScript type BEFORE
 * validators run, so `{ "firstName": { "$ne": null } }` became the string "[object Object]" and passed
 * `@IsString`, and `["a"]` became "a". Numbers and booleans that arrive as query strings are converted
 * explicitly with `@Type`/`@Transform` on the DTO instead.
 */
export function appValidationPipe(): ValidationPipe {
  return new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
}
